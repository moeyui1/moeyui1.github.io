---
title: Android 中的 AsyncTask
tags: Android
abbrlink: 6d85de2d
date: 2017-06-13 22:48:01
---
当尝试在 Android 应用的主线程中访问网络时，会抛出一个`NetworkOnMainThreadException`异常，这是为什么呢？
因为网络请求通常是很耗时的，若想确保应用流畅，主线程的任务执行时间应该控制在十几毫秒级。且当主线程无响应超过5秒，系统就会提示弹出一个对话框，告诉用户当前应用无响应，是否要强制关闭。所以要使用网络请求，我们只能使用辅助线程。

<!--more-->

# AsyncTask

AsyncTask，字面意思就是异步的任务，是 Android 提供的一个异步框架。实际上，UI 线程有一个消息队列用于接收和处理其它线程的消息。AsyncTask 对其提供了一个简单的封装。这是 AsyncTask 的声明代码：

```java
public abstract class AsyncTask<Params, Progress, Result> 
```

它是一个泛型抽象类，三个参数意思分别是：

1. Params 执行时传递给 task 的参数类型
2. Progress 即后台计算时用于更新 task 进度的类型
3. Result 即任务执行结果的类型

## 生命周期

AsyncTask 生命周期可以简单分为4个步骤。

### onPreExecute

首先在 UI 线程调用该方法。

### doInBackground

这是必须被 Override 的函数，该函数在辅助线程中执行，耗时的任务一般就在这里执行。该方法获得调用 execute 方法的参数。在此方法中可以调用 `void publishProgress (Progress... values)`这个函数，可以触发 UI 线程中执行 onProgressUpdate 函数。

### onProgressUpdate

被 publishProgress 函数触发，用于更新 UI 线程中的进度条等组件。

### onPostExecute

任务执行完后在 UI 线程中被调用。

## 线程实现

```java
private static final int CPU_COUNT = Runtime.getRuntime().availableProcessors();
// We want at least 2 threads and at most 4 threads in the core pool,
// preferring to have 1 less than the CPU count to avoid saturating
// the CPU with background work
private static final int CORE_POOL_SIZE = Math.max(2, Math.min(CPU_COUNT - 1, 4));
...
  private static final BlockingQueue<Runnable> sPoolWorkQueue =
  new LinkedBlockingQueue<Runnable>(128);
static {
  ThreadPoolExecutor threadPoolExecutor = new ThreadPoolExecutor(
    CORE_POOL_SIZE, MAXIMUM_POOL_SIZE, KEEP_ALIVE_SECONDS, TimeUnit.SECONDS,
    sPoolWorkQueue, sThreadFactory);
  threadPoolExecutor.allowCoreThreadTimeOut(true);
  THREAD_POOL_EXECUTOR = threadPoolExecutor;
}

```



阅读代码可以发现任务使用了 java 中的 `ThreadPoolExecutor`类，并且线程池的大小针对 CPU 核心数做了优化。

线程池队列采用了链表堵塞队列，保证线程安全性。

```java
public AsyncTask() {
  mWorker = new WorkerRunnable<Params, Result>() {
    public Result call() throws Exception {
      mTaskInvoked.set(true);
      Result result = null;
      try {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        //noinspection unchecked
        result = doInBackground(mParams);
        Binder.flushPendingCommands();
      } catch (Throwable tr) {
        mCancelled.set(true);
        throw tr;
      } finally {
        postResult(result);
      }
      return result;
    }
  };

  mFuture = new FutureTask<Result>(mWorker) {
    @Override
    protected void done() {
      try {
        postResultIfNotInvoked(get());
      } catch (InterruptedException e) {
        android.util.Log.w(LOG_TAG, e);
      } catch (ExecutionException e) {
        throw new RuntimeException("An error occurred while executing doInBackground()",
                                   e.getCause());
      } catch (CancellationException e) {
        postResultIfNotInvoked(null);
      }
    }
  };
}
```

上面是构造方法，可以发现 task 执行结果是通过 `java.util.concurrent。FutureTask`实现的。