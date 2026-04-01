---
title: gRPC Bidirectional（双向流）源码分析
category: 开发  
tags:
  - gRPC
  - 源码分析
abbrlink: d1717587
pubDate: 2018-10-13 19:26:28
description: ""
---

gRPC 是一个优秀的开源 RPC 框架，它能够实现双向流式调用。本文从源码的角度出发，分层剖析 gRPC 流式调用的实现。

![iN7ZfU.png](https://s1.ax1x.com/2018/10/13/iN7ZfU.png)

<!-- more -->


# Overview

从高层上看，gRPC 可分为三层: **Stub/桩**, **Channel/通道** & **Transport/传输**.

## Stub

> The Stub layer is what is exposed to most developers and provides type-safe bindings to whatever datamodel/IDL/interface you are adapting. gRPC comes with a [plugin](https://github.com/google/grpc-java/blob/master/compiler) to the protocol-buffers compiler that generates Stub interfaces out of .protofiles, but bindings to other datamodel/IDL are easy and encouraged.

## Channel

> The Channel layer is an abstraction over Transport handling that is suitable for interception/decoration and exposes more behavior to the application than the Stub layer. It is intended to be easy for application frameworks to use this layer to address cross-cutting concerns such as logging, monitoring, auth, etc.

Channel 层是 Transport 层处理上的抽象，适合 interception/decoration ，并暴露更多行为给应用（相比 Stub 层）。它的目的是为了使应用框架利用改成方便地实现 address cross-cutting 例如日志、监控、鉴权等。

## Transport

The Transport layer does the heavy lifting of putting and taking bytes off the wire. The interfaces to it are abstract just enough to allow plugging in of different implementations. Note the transport layer API is considered internal to gRPC and has weaker API guarantees than the core API under package io.grpc.

gRPC 自带3种 Transport 实现:

1. Netty-based transport 是主要的 transport 实现，基于 Netty。为客户端和服务端使用。
2. OkHttp-based transport 是一个轻量级的 transport，基于 OkHttp。这主要被用在 Android 上，只能用在客户端。
3. In-Process transport 是为服务端和客户端在同一进程时准备的。它对测试很有用，在生产环境也很安全。

# 使用

以 gRPC 官方的 examples 为例看下表层的情况。

## 客户端

```java
 /**
   * Bi-directional example, which can only be asynchronous. Send some chat messages, and print any
   * chat messages that are sent from the server.
   */
  public CountDownLatch routeChat() {
    info("*** RouteChat");
    final CountDownLatch finishLatch = new CountDownLatch(1);
    StreamObserver<RouteNote> requestObserver =
        // 方法调用还未开始，从这里获得一个 StreamObserver，用于传递请求流
        asyncStub.routeChat(new StreamObserver<RouteNote>() {
          // 自实现 StreamObserver，gRPC 会在适当时机调用下面的方法
          @Override
          public void onNext(RouteNote note) {
            info("Got message \"{0}\" at {1}, {2}", note.getMessage(), note.getLocation()
                .getLatitude(), note.getLocation().getLongitude());
          }

          @Override
          public void onError(Throwable t) {
            warning("RouteChat Failed: {0}", Status.fromThrowable(t));
            finishLatch.countDown();
          }

          @Override
          public void onCompleted() {
            info("Finished RouteChat");
            finishLatch.countDown();
          }
        });

    try {
      RouteNote[] requests =
          {newNote("First message", 0, 0), newNote("Second message", 0, 1),
              newNote("Third message", 1, 0), newNote("Fourth message", 1, 1)};

      for (RouteNote request : requests) {
        info("Sending message \"{0}\" at {1}, {2}", request.getMessage(), request.getLocation()
            .getLatitude(), request.getLocation().getLongitude());
        // 通过 StreamObserver 不断发送请求流
        requestObserver.onNext(request);
      }
    } catch (RuntimeException e) {
      // Cancel RPC
      requestObserver.onError(e);
      throw e;
    }
    // Mark the end of requests
    requestObserver.onCompleted();

    // return the latch while receiving happens asynchronously
    return finishLatch;
  }
```

## 服务端

```java
	/**
     * Receives a stream of message/location pairs, and responds with a stream of all previous
     * messages at each of those locations.
     *
     * @param responseObserver an observer to receive the stream of previous messages.
     * @return an observer to handle requested message/location pairs.
     */
    @Override
    // 传入参数是由 gRPC 生成的一个 StreamObserver，通过它可以实现流式响应
    public StreamObserver<RouteNote> routeChat(final StreamObserver<RouteNote> responseObserver) {
      // 这个 StreamObserver 在适当时机被 gRPC 调用
      return new StreamObserver<RouteNote>() {
        @Override
        public void onNext(RouteNote note) {
          List<RouteNote> notes = getOrCreateNotes(note.getLocation());

          // Respond with all previous notes at this location.
          for (RouteNote prevNote : notes.toArray(new RouteNote[0])) {
            responseObserver.onNext(prevNote);
          }

          // Now add the new note to the list
          notes.add(note);
        }

        @Override
        public void onError(Throwable t) {
          logger.log(Level.WARNING, "routeChat cancelled");
        }

        @Override
        public void onCompleted() {
          responseObserver.onCompleted();
        }
      };
    }
```

## StreamObserver

看了上面的代码可以知道，StreamObserver 正是 gRPC 在 Stub 层提供的一个流式 Observer，通过它可以实现接收和发送流。

```java
package io.grpc.stub;

/**
 * Receives notifications from an observable stream of messages.
 *
 * <p>It is used by both the client stubs and service implementations for sending or receiving
 * stream messages. It is used for all {@link io.grpc.MethodDescriptor.MethodType}, including
 * {@code UNARY} calls.  For outgoing messages, a {@code StreamObserver} is provided by the GRPC
 * library to the application. For incoming messages, the application implements the
 * {@code StreamObserver} and passes it to the GRPC library for receiving.
 *
 * <p>Implementations are not required to be thread-safe (but should be
 * <a href="http://www.ibm.com/developerworks/library/j-jtp09263/">thread-compatible</a>).
 * Separate {@code StreamObserver}s do
 * not need to be synchronized together; incoming and outgoing directions are independent.
 * Since individual {@code StreamObserver}s are not thread-safe, if multiple threads will be
 * writing to a {@code StreamObserver} concurrently, the application must synchronize calls.
 */
public interface StreamObserver<V>  {
  /**
   * Receives a value from the stream.
   *
   * <p>Can be called many times but is never called after {@link #onError(Throwable)} or {@link
   * #onCompleted()} are called.
   *
   * <p>Unary calls must invoke onNext at most once.  Clients may invoke onNext at most once for
   * server streaming calls, but may receive many onNext callbacks.  Servers may invoke onNext at
   * most once for client streaming calls, but may receive many onNext callbacks.
   *
   * <p>If an exception is thrown by an implementation the caller is expected to terminate the
   * stream by calling {@link #onError(Throwable)} with the caught exception prior to
   * propagating it.
   *
   * @param value the value passed to the stream
   */
  void onNext(V value);

  /**
   * Receives a terminating error from the stream.
   *
   * <p>May only be called once and if called it must be the last method called. In particular if an
   * exception is thrown by an implementation of {@code onError} no further calls to any method are
   * allowed.
   *
   * <p>{@code t} should be a {@link io.grpc.StatusException} or {@link
   * io.grpc.StatusRuntimeException}, but other {@code Throwable} types are possible. Callers should
   * generally convert from a {@link io.grpc.Status} via {@link io.grpc.Status#asException()} or
   * {@link io.grpc.Status#asRuntimeException()}. Implementations should generally convert to a
   * {@code Status} via {@link io.grpc.Status#fromThrowable(Throwable)}.
   *
   * @param t the error occurred on the stream
   */
  void onError(Throwable t);

  /**
   * Receives a notification of successful stream completion.
   *
   * <p>May only be called once and if called it must be the last method called. In particular if an
   * exception is thrown by an implementation of {@code onCompleted} no further calls to any method
   * are allowed.
   */
  void onCompleted();
}
```

# 简图

整个实现是建立在复杂的监听模式基础上的。以 Client 端为视角：

![drawio](https://oeoiy7i1f.qnssl.com/gRPC%E5%8F%8C%E5%90%91%E6%B5%81/drawio.svg)

Server 端视角可触类旁通。

# 分层分析

上面的一图比较多比较乱，下面来逐层分析。

## Stub 层

这一层关注 `StreamObserver`，它的代码上文已经贴过了。使用者就是通过它实现流式通信。结合上文的源码分析，可以得到以下结论：

- 对于客户端来说，resp 由 gRPC 生成并返回，req 则是客户端自行实现 `StreamObserver`。
- 对于服务端来说，req 由 gRPC 生成并作为入参交给服务端方法，resp 则是服务端自己实现并返回给 gRPC。

模糊的地方就在 gRPC 如何生成一个 `StreamObserver`。以客户端为例分析：

![](https://ws3.sinaimg.cn/large/006tNbRwgy1fw5gx3xqspj30ds0843yj.jpg)

发起请求时，首先通过 Channel 获得一个 `ClientCall`，这个 call 是 Channel 层的，在 Stub 层客户端需要使用 `StreamObserver`，故使用了一个 `CallToStreamObserverAdapter` 来将 call 包起来返回给客户端。

```java
private static final class CallToStreamObserverAdapter<T> extends ClientCallStreamObserver<T> {
    private boolean frozen;
    private final ClientCall<T, ?> call;
    private Runnable onReadyHandler;
    private boolean autoFlowControlEnabled = true;

    // Non private to avoid synthetic class
    CallToStreamObserverAdapter(ClientCall<T, ?> call) {
      this.call = call;
    }

    private void freeze() {
      this.frozen = true;
    }

    @Override
    public void onNext(T value) {
      call.sendMessage(value);
    }

    @Override
    public void onError(Throwable t) {
      call.cancel("Cancelled by client with StreamObserver.onError()", t);
    }

    @Override
    public void onCompleted() {
      call.halfClose();
    }

    @Override
    public boolean isReady() {
      return call.isReady();
    }

    @Override
    public void setOnReadyHandler(Runnable onReadyHandler) {
      if (frozen) {
        throw new IllegalStateException("Cannot alter onReadyHandler after call started");
      }
      this.onReadyHandler = onReadyHandler;
    }

    @Override
    public void disableAutoInboundFlowControl() {
      if (frozen) {
        throw new IllegalStateException("Cannot disable auto flow control call started");
      }
      autoFlowControlEnabled = false;
    }

    @Override
    public void request(int count) {
      call.request(count);
    }

    @Override
    public void setMessageCompression(boolean enable) {
      call.setMessageCompression(enable);
    }

    @Override
    public void cancel(@Nullable String message, @Nullable Throwable cause) {
      call.cancel(message, cause);
    }
  }
```

看了 `CallToStreamObserverAdapter` 的源码，就知道客户端在调用 `StreamObserver.next(value)` 方法时，实际就是调用了 `call.sendMessage(value)` 发送消息。其实 `CallToStreamObserverAdapter` 就是 `ClientCall` 在 Stub 层的适配器。

上面说的都是请求的 `StreamObserver`，那响应的 `StreamObserver` 呢？因为客户端已经在自实现的 `StreamObserver` 中实现了对响应的处理方法，所以客户端后续已经不需要与响应的 `StreamObserver` 交互了，所以这个自实现的 `StreamObserver` 直接被传到了 Channel 层。

## Channel 层

这一层逻辑开始复杂，也是本文主要关注的层级。这层主要关注一个 ClientCallImpl 和一个 StreamObserverToCallListenerAdapter。

![](https://ws1.sinaimg.cn/large/006tNbRwgy1fw5h0qf5vvj30et09yjrj.jpg)

先看 ClientCallImpl，它是 ClientCall 的实现类，它内部持有一个 ClientCall.Listener，这是用来监听什么的呢？

上面 Stub 层末尾讲到响应的 StreamObserver 传到了 Channel 层，实际就是到了 StreamObserverToCallListenerAdapter 的 observer 中。*gRPC 的命名都很直白。*而其中的 adapter 就是 stub 层的 CallToStreamObserverAdapter。它持有两个 StreamObserver 想干啥？

实际上 StreamObserverToCallListenerAdapter 接管了两个 StreamObserver 的监听，合并成一个 ClientCall.Listener 去监听 ClientCallImpl，到这里，自定义的监听终于和请求绑定在一起了。

ClientCallImpl 内部封装了诸如消息发送等网络细节，通过它持有的 ClientStream 类型引用实现。这是 Transport 层的概念了。

## Transport 层

这一层就更复杂些，可对接多种实现，本文不做讨论~~（偷懒了~~。

## 协议层

gRPC 基于 Http2，多路复用是 Http2 的一大特性。这一特性得益于 frame 的设计，**frame 的 Header 中标识了它属于的流**。

![](https://ws3.sinaimg.cn/large/006tNbRwgy1fw5h2ljh83j314w06it9j.jpg)

# 消息顺序性

流式消息必然存在消息顺序性的问题，在 `ClientCall.java` 中提到

```java
   /**
   * Requests up to the given number of messages from the call to be delivered to
   * {@link Listener#onMessage(Object)}. No additional messages will be delivered.
   *
   * <p>Message delivery is guaranteed to be sequential in the order received. In addition, the
   * listener methods will not be accessed concurrently. While it is not guaranteed that the same
   * thread will always be used, it is guaranteed that only a single thread will access the listener
   * at a time.
   *
   * <p>If it is desired to bypass inbound flow control, a very large number of messages can be
   * specified (e.g. {@link Integer#MAX_VALUE}).
   *
   * <p>If called multiple times, the number of messages able to delivered will be the sum of the
   * calls.
   *
   * <p>This method is safe to call from multiple threads without external synchronization.
   *
   * @param numMessages the requested number of messages to be delivered to the listener. Must be
   *                    non-negative.
   * @throws IllegalStateException if call is not {@code start()}ed
   * @throws IllegalArgumentException if numMessages is negative
   */
  public abstract void request(int numMessages);
```

由此可得 gRPC 遵守消息到达顺序。

# 流式消息中的背压（不存在）

流式消息必然涉及到这样的问题，当请求发送速度远大于服务端对请求处理速度时，持续的请求可能会压垮服务端。这时可以阻塞请求，来达到降低请求发送速度的目的，可称为背压。但 gRPC 中没有背压。？？？有点诧异。

## 非阻塞

但这并不是说 gRPC 没有处理这种问题的能力。首先确认下客户端发送请求是否有可能阻塞。一路跟踪代码下探到 transport 层，在 Stream.java#writeMessage(msg) 的注释中提到：

> *This method will always return immediately and will not wait for the write to complete.*

故客户端发送是不会阻塞的。

## 流控制

但是 gRPC 是基于 Http2 的，Http2 有流控的机制，简单来说，接收端可以给发送端设定一个窗口值。以此，可以限制客户端发送的速度，但是没有背压就意味着没法限制用户，这样可能导致客户端的待发送缓存爆掉，问题还是没法解决。

## onReady

别着急，看下 `CallStreamObserver.java`

```java
  /**
   * If {@code true}, indicates that the observer is capable of sending additional messages
   * without requiring excessive buffering internally. This value is just a suggestion and the
   * application is free to ignore it, however doing so may result in excessive buffering within the
   * observer.
   */
  public abstract boolean isReady();

  /**
   * Set a {@link Runnable} that will be executed every time the stream {@link #isReady()} state
   * changes from {@code false} to {@code true}.  While it is not guaranteed that the same
   * thread will always be used to execute the {@link Runnable}, it is guaranteed that executions
   * are serialized with calls to the 'inbound' {@link StreamObserver}.
   *
   * <p>On client-side this method may only be called during {@link
   * ClientResponseObserver#beforeStart}. On server-side it may only be called during the initial
   * call to the application, before the service returns its {@code StreamObserver}.
   *
   * <p>Note that the handler may be called some time after {@link #isReady} has transitioned to
   * true as other callbacks may still be executing in the 'inbound' observer.
   *
   * @param onReadyHandler to call when peer is ready to receive more messages.
   */
  public abstract void setOnReadyHandler(Runnable onReadyHandler);
```

可看到作为替代，用户可以使用 onReady 的监听，这样可以避免待发送消息爆掉。

## 小结

gRPC 这个方案看似比背压更复杂，但实际上更合理。首先依靠 Http2 从网络上控制请求的频率，将异常和问题拦截在客户端，锅分得合理。然后在客户端，提供了解决问题的方案，并允许设定 handler，对客户端来说也是简单方便的。

# 参考

1. [gRpc-java Readme](https://github.com/grpc/grpc-java).
2. [HTTP2.0关于多路复用的研究](https://www.nihaoshijie.com.cn/index.php/archives/698/)

