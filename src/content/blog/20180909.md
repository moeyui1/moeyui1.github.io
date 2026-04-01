---
title: Istio学习之Pilot-agent
tags:
  - Istio
  - meituan
  - service mesh
category: 开发
abbrlink: 760a5082
pubDate: 2018-09-09 14:09:06
description: ""
---

Pilot 是 Istio 中一个重要的组件，它主要分为 Agent 和 Discovery Services 两部分。本文着重介绍下承担 Envoy 保姆一职的 Agent。

![Pilot](https://camo.githubusercontent.com/919e2e3cd8e4267a00035b813df53902864a3388/68747470733a2f2f63646e2e7261776769742e636f6d2f697374696f2f70696c6f742f6d61737465722f646f632f70696c6f742e737667)

<!--more-->

# 功能简述

在proxy镜像中，pilot-agent 负责的工作包括：

1. 生成envoy的配置：指的是生成 Envoy 的启动配置
2. 启动envoy
3. 监控并管理envoy的运行状况，比如envoy出错时pilot-agent负责重启envoy，或者envoy配置变更后reload envoy

而 envoy 负责接受所有发往该pod的网络流量，分发所有从pod中发出的网络流量。

> 根据代码中的`sidecar-injector-configmap.yaml`（用来配置如何自动化地inject istio sidecar），inject过程中，除了proxy镜像作为sidecar之外，每个pod还会带上initcontainer（Kubernetes中的概念），具体镜像为proxy_init。proxy_init通过注入iptables规则改写流入流出pod的网络流量规则，使得流入流出pod的网络流量重定向到proxy的监听端口，而应用对此无感。

![istio-pilot-proxy (2).png](https://i.loli.net/2018/09/09/5b94b1c621c56.png)

注意上图中 Envoy 处于 Istio/proxy 的内层。这是因为 Istio 并非直接使用 Envoy ，而是在其之上有一层定制，具体可见 [Istio/proxy](https://github.com/istio/proxy) 这个项目。

> The Istio proxy contains extensions to the Envoy proxy (in the form of Envoy filters), that allow the proxy to delegate policy enforcement decisions to Mixer.
>
> Istio/proxy 项目包含 Envoy 扩展（由 Envoy filters 构成），允许 proxy 将策略强制决策委托给 Mixer。

这就解释了 Proxy 是如何与 Mixer 交互的。

# 部署存在形式

pilot-agent在pilot/cmd包下面，**是个单独的二进制**。

pilot-agent**跟 envoy 打包在同一个docker镜像里**，镜像由`Dockerfile.proxy`定义。Makefile（include了`tools/istio-docker.mk`）把这个dockerfile build成了`${HUB}/proxyv2:${TAG}`镜像，也就是 Kubernetes 里跟应用放在同一个pod下的sidecar。

*非Kubernetes情况下需要把pilot-agent、envoy跟应用部署在一起，惊了。*

# 生成envoy的配置

略

# Envoy 的监控和管理

为envoy生成好配置文件之后，pilot-agent还要负责envoy进程的监控与管理工作，包括：

1. 创建envoy对象，结构体包含proxyConfig（前面步骤中为envoy生成的配置信息），role.serviceNode(似乎是agent唯一标识符），loglevel和pilotsan（service account name）
2. 创建agent对象，包含前面创建的envoy结构体，一个epochs的map，3个channel：configCh, statusCh和abortCh
3. 创建watcher并启动协程执行watcher.Run watcher.Run首先启动协程执行agent.Run（**agent的主循环**），然后调用watcher.Reload(kickstart the proxy with partial state (in case there are no notifications coming))，**Reload会调用agent.ScheduleConfigUpdate，并最终导致第一个envoy进程启动，见后面分析**。然后监控各种证书，如果证书文件发生变化，则调用ScheduleConfigUpdate来reload envoy，然后watcher.retrieveAZ(TODO)
4. 创建context，调用cmd.WaitSignal以等待进程接收到SIGINT, SIGTERM信号，接受到信号之后通过context通知agent，agent接到通知后调用terminate来kill所有envoy进程，并退出agent进程

> 上面的pilot/pkg/proxy包下的agent中采用Proxy接口管理pilot/pkg/proxy/envoy包下的envoy对象，从理论上来说也可以把envoy换成其他proxy实现管理。不过此事还牵扯discovery service等其他组件。

上面第三步启动协程执行的agent.Run是agent的主循环，会一直通过监听以下几个channel来监控envoy进程：

1. agent的configCh:如果配置文件，**主要是那些证书文件发生变化**，则调用agent.reconcile来reload envoy
2. statusCh:这里的status其实就是exitStatus，处理envoy进程退出状态，处理流程如下：
   1. 把刚刚退出的epoch从agent维护的两个map里删了，后面会讲到这两个map。把agent.currentConfig置为agent.latestEpoch对应的config，因为agent在reconcile的过程中只有在desired config和current config不同的时候才会创建新的epoch，所以这里把currentConfig设置为上一个config之后，必然会造成下一次reconcile的时候current与desired不等，从而创建新的envoy
   2. 如果exitStatus.err是errAbort，表示是agent让envoy退出的（这个error是调用agent.abortAll时发出的），这时只要log记录epoch序列号为xxx的envoy进程退出了
   3. 如果exitStatus.err并非errAbort，则log记录epoch异常退出，并给所有当前正在运行的其他epoch进程对应的abortCh发出errAbort，所以后续其他envoy进程也都会被kill掉，并全都往agent.statusCh写入exitStatus，当前的流程会全部再为每个epoch进程走一遍
   4. 如果是其他exitStatus（什么时候会进入这个否则情况？比如exitStatus.err是wait epoch进程得到的正常退出信息，即nil），则log记录envoy正常退出
   5. 调用envoy.Cleanup，删除刚刚退出的envoy进程对应的配置文件，文件路径由ConfigPath和epoch序列号串起来得到
   6. 如果envoy进程为非正常退出，也就是除了“否则”描述的case之外的2中情况，则试图恢复刚刚退出的envoy进程（可见前面向所有其他进程发出errAbort消息的意思，并非永远停止envoy，pilot-agent接下来马上就会重启被abort的envoy）。恢复方式并不是当场启动新的envoy，而是schedule一次reconcile。如果启动不成功，可以在得到exitStatus之后再次schedule（每次间隔时间为 $2^n*200$ 毫秒 ），最多重试10次（budget），如果10次都失败，则退出整个golang的进程（os.Exit）,由容器环境决定如何恢复pilot-agent。所谓的schedule，就是往agent.retry.restart写入一个预定的未来的某个时刻，并扣掉一次budget（budget在每次reconcile之前都会被重置为10），然后就结束当前循环。在下一个开始的时候，会检测agent.retry.restart，如果非空，则计算距离reconcile的时间delay
3. time.After（delay）:监听是否到时间执行schedule的reconcile了，到了则执行agent.reconcile
4. ctx.Done:执行agent.terminate terminate方法比较简单，向所有的envoy进程的abortCh发出errAbort消息，造成他们全体被kill（Cmd.Kill），然后agent自己return，退出当前的循环，这样就不会有人再去重启envoy

```go
func (a *agent) Run(ctx context.Context) {
	log.Info("Starting proxy agent")

	// Throttle processing up to smoothed 1 qps with bursts up to 10 qps.
	// High QPS is needed to process messages on all channels.
	rateLimiter := rate.NewLimiter(1, 10)

	for {
	err := rateLimiter.Wait(ctx)
		if err != nil {
			a.terminate()
			return
		}

		// maximum duration or duration till next restart
		var delay time.Duration = 1<<63 - 1
		if a.retry.restart != nil {
			delay = time.Until(*a.retry.restart)
		}

		select {
		case config := <-a.configCh:
			if !reflect.DeepEqual(a.desiredConfig, config) {
				log.Infof("Received new config, resetting budget")
				a.desiredConfig = config

				// reset retry budget if and only if the desired config changes
				a.retry.budget = a.retry.MaxRetries
				a.reconcile()
			}

		case status := <-a.statusCh:
			// delete epoch record and update current config
			// avoid self-aborting on non-abort error
			delete(a.epochs, status.epoch)
			delete(a.abortCh, status.epoch)
			a.currentConfig = a.epochs[a.latestEpoch()]

			if status.err == errAbort {
				log.Infof("Epoch %d aborted", status.epoch)
			} else if status.err != nil {
				log.Warnf("Epoch %d terminated with an error: %v", status.epoch, status.err)

				// NOTE: due to Envoy hot restart race conditions, an error from the
				// process requires aggressive non-graceful restarts by killing all
				// existing proxy instances
				a.abortAll()
			} else {
				log.Infof("Epoch %d exited normally", status.epoch)
			}

			// cleanup for the epoch
			a.proxy.Cleanup(status.epoch)

			// schedule a retry for an error.
			// the current config might be out of date from here since its proxy might have been aborted.
			// the current config will change on abort, hence retrying prior to abort will not progress.
			// that means that aborted envoy might need to re-schedule a retry if it was not already scheduled.
			if status.err != nil {
				// skip retrying twice by checking retry restart delay
				if a.retry.restart == nil {
					if a.retry.budget > 0 {
						delayDuration := a.retry.InitialInterval * (1 << uint(a.retry.MaxRetries-a.retry.budget))
						restart := time.Now().Add(delayDuration)
						a.retry.restart = &restart
						a.retry.budget = a.retry.budget - 1
						log.Infof("Epoch %d: set retry delay to %v, budget to %d", status.epoch, delayDuration, a.retry.budget)
					} else {
						log.Error("Permanent error: budget exhausted trying to fulfill the desired configuration")
						a.proxy.Panic(status.epoch)
						return
					}
				} else {
					log.Debugf("Epoch %d: restart already scheduled", status.epoch)
				}
			}

		case <-time.After(delay):
			a.reconcile()

		case _, more := <-ctx.Done():
			if !more {
				a.terminate()
				return
			}
		}
	}
}
```

# Envoy 启动流程

## 热重启

Pilot agent 的职责之一就是重启proxy，一般是Envoy。可以支持Envoy的热重启。

> Agent manages the restarts and the life cycle of a proxy binary. Agent keeps track of all running proxy epochs and their configurations. Hot restarts are performed by launching a new proxy process with a strictly incremented restart epoch. **It is up to the proxy to ensure that older epochs gracefully shutdown and carry over all the necessary state to the latest epoch. The agent does not terminate older epochs.** The initial epoch is 0.

旧实例是否完全关闭，并将必要的状态数据迁移到新实例是由 Proxy 负责的（Agent 不会管）。Agent 不会关闭旧实例。言下之意，Proxy 自己负责旧实例的处理。

> The restart protocol matches Envoy semantics for restart epochs: to successfully launch a new Envoy process that will replace the running Envoy processes, the restart epoch of the new process must be exactly 1 greater than the highest restart epoch of the currently running Envoy processes. See <https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/hot_restart.html> for more information about the Envoy hot restart protocol. Agent requires two functions "run" and "cleanup". Run function is a call to start the proxy and must block until the proxy exits. Cleanup function is executed immediately after the proxy exits and must be non-blocking since it is executed synchronously in the main agent control loop. Both functions take the proxy epoch as an argument. A typical scenario would involve epoch 0 followed by a failed epoch 1 start. The agent then attempts to start epoch 1 again.

> Whenever the run function returns an error, the agent assumes that the proxy failed to start and attempts to restart the proxy several times with an exponential back-off. The subsequent restart attempts may reuse the epoch from the failed attempt. Retry budgets are allocated whenever the desired configuration changes.

> Agent executes a single control loop that receives notifications about scheduled configuration updates, exits from older proxy epochs, and retry attempt timers. The call to schedule a configuration update will block until the control loop is ready to accept and process the configuration update.

热重启的流程：

1. 启动另外一个envoy2进程（Secondary process）
2. envoy2通知envoy1（Primary process）关闭其管理的端口，由envoy2接管
3. 通过UDS把envoy1可用的listen sockets拿过来
4. envoy2初始化成功，通知envoy1在一段时间内（drain-time-s）优雅关闭正在工作的请求
5. 到了时间（parent-shutdown-time-s），envoy2通知envoy1自行关闭
6. envoy2升级为envoy1

> 从上面的执行步骤来看，poilt-agent **只负责启动另一个envoy进程**，其他由envoy自行处理。

## 抢救 Envoy

> envoy是一个服务，既然是服务都不可能保证100%的可用，如果envoy不幸运宕掉了，那么pilot-agent如何进行抢救，保证envoy高可用？

### 获取退出状态

> 在上面提到pilot-agent启动envoy后，会监听envoy的退出状态，发现非正常退出状态，就会抢救envoy。

```go
func (proxy envoy) Run(config interface{}, epoch int, abort <-chan error) error {
    ......
    // Set if the caller is monitoring envoy, for example in tests or if envoy runs in same
    // container with the app.
    if proxy.errChan != nil {
      // Caller passed a channel, will wait itself for termination
      go func() {
        proxy.errChan <- cmd.Wait()
      }()
      return nil
    }

    done := make(chan error, 1)
    go func() {
      done <- cmd.Wait()
    }()
    ......
}
```

### 抢救envoy

> 使用 kill -9 可以模拟envoy非正常退出状态。当出现非正常退出，pilot-agent的抢救机制会被触发。如果第一次抢救成功，那当然是好，如果失败了，pilot-agent会继续抢救，最多抢救10次，每次间隔时间为 2 n *100* time.Millisecond。超过10次都没有救活，pilit-agent就会放弃抢救，宣布死亡，并且退出istio/proxy，让k8s重新启动一个新容器。

`istio.io/istio/pilot/pkg/proxy/agent.go #164`

```go
func (a *agent) Run(ctx context.Context) {
  ......
  for {
    ......
    select {
        ......
    case status := <-a.statusCh:
        ......
      if status.err == errAbort {
        //pilot-agent通知退出 或 envoy非正常退出
        log.Infof("Epoch %d aborted", status.epoch)
      } else if status.err != nil {
        //envoy非正常退出
        log.Warnf("Epoch %d terminated with an error: %v", status.epoch, status.err)
                ......
        a.abortAll()
      } else {
        //正常退出
        log.Infof("Epoch %d exited normally", status.epoch)
      }
    ......
    if status.err != nil {
      // skip retrying twice by checking retry restart delay
      if a.retry.restart == nil {
        if a.retry.budget > 0 {
          delayDuration := a.retry.InitialInterval * (1 << uint(a.retry.MaxRetries-a.retry.budget))
          restart := time.Now().Add(delayDuration)
          a.retry.restart = &restart
          a.retry.budget = a.retry.budget - 1
          log.Infof("Epoch %d: set retry delay to %v, budget to %d", status.epoch, delayDuration, a.retry.budget)
        } else {
          //宣布死亡，退出istio/proxy
          log.Error("Permanent error: budget exhausted trying to fulfill the desired configuration")
          a.proxy.Panic(a.desiredConfig)
          return
        }
      } else {
        log.Debugf("Epoch %d: restart already scheduled", status.epoch)
      }
    }
    case <-time.After(delay):
        ......
    case _, more := <-ctx.Done():
        ......
    }
  }
}
```

`istio.io/istio/pilot/pkg/proxy/agent.go #72`

```go
var (
  errAbort = errors.New("epoch aborted")
  // DefaultRetry configuration for proxies
  DefaultRetry = Retry{
    MaxRetries:      10,
    InitialInterval: 200 * time.Millisecond,
  }
)
```

# 参考

1. [Service Mesh深度学习系列part1—istio源码分析之pilot-agent模块分析](http://www.servicemesher.com/blog/istio-service-mesh-source-code-pilot-agent-deepin)
2. [ istio源码分析——pilot-agent如何管理envoy生命周期](https://segmentfault.com/a/1190000015171622)

# FAQ

1. ## Agent 生成 Envoy 的配置？

   指的是结合用户自定义配置生成 Envoy 的启动参数配置。

2. ## Agent 在 Envoy 热重启中扮演什么角色？

   Agent **只负责启动另一个envoy进程**，其他由envoy自行处理。