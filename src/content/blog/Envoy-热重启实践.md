---
title: Envoy 热重启实践
category: 开发
description: Envoy 支持热重启，本文主要介绍热重启的实践和官方热重启包装器的使用
tags:
  - envoy
abbrlink: c193b63f
pubDate: 2019-01-29 21:02:31
---

[Envoy](https://www.envoyproxy.io/) 是一个高性能的开源服务代理。本文主要介绍热重启的实践和官方热重启包装器的使用。

Envoy 支持热重启，并且为了兼容进程管理器（例如 monit、runit 等）提供了一个 Python 写的热重启包装器 `restart/hot-restarter.py`。

但是官方文档讲得不是很清楚，一开始误解了包装器的使用方式，疯狂碰壁。。。

# 手动热重启

如果不使用包装器，手动热重启时，需要在新进程启动参数中添加 --restart-epoch x ，x表示重启纪元，按1递增。不传默认为0，故第一次启动可以不传。

> restart epoch 应该按1递增，因为在 Envoy 源码中，会按照 epoch -1 计算和 epoch +1 计算 parent address 和 child address

```c++
HotRestartImpl::HotRestartImpl(Options& options)
    : options_(options), stats_set_options_(blockMemHashOptions(options.maxStats())),
      shmem_(SharedMemory::initialize(
          RawStatDataSet::numBytes(stats_set_options_, options_.statsOptions()), options_)),
      log_lock_(shmem_.log_lock_), access_log_lock_(shmem_.access_log_lock_),
      stat_lock_(shmem_.stat_lock_), init_lock_(shmem_.init_lock_) {
  {
    // We must hold the stat lock when attaching to an existing memory segment
    // because it might be actively written to while we sanityCheck it.
    Thread::LockGuard lock(stat_lock_);
    stats_set_.reset(new RawStatDataSet(stats_set_options_, options.restartEpoch() == 0,
                                        shmem_.stats_set_data_, options_.statsOptions()));
  }
  my_domain_socket_ = bindDomainSocket(options.restartEpoch());
  // 这里计算 child address
  child_address_ = createDomainSocketAddress((options.restartEpoch() + 1));
  initDomainSocketAddress(&parent_address_);
  if (options.restartEpoch() != 0) {
    // 这里计算 parent address
    parent_address_ = createDomainSocketAddress((options.restartEpoch() + -1));
  }

  // If our parent ever goes away just terminate us so that we don't have to rely on ops/launching
  // logic killing the entire process tree. We should never exist without our parent.
  int rc = prctl(PR_SET_PDEATHSIG, SIGTERM);
  RELEASE_ASSERT(rc != -1, "");
}
```

# 包装器热重启
## 使用

为了兼容各种进程管理，最好是用包装器将 Envoy 管理起来。这里主要介绍官方的 Python 包装器。

使用包装器即把 Envoy 的生命周期管理委托给包装器， [Istio](https://istio.io/) 中的 [Pilot-agent](https://istio.io/docs/concepts/what-is-istio/#pilot) 也是这样做的。启动时应启动包装器：

```bash
python restart/hot-restarter.py start_envoy.sh
```
其中 start_envoy.sh 为用户自定义的启动脚本，包装器会在每次热重启时调用这个脚本。可以这么写：

```bash
#!/bin/bash
exec /code/envoy-bin/envoy  -c /code/envoy.yaml --restart-epoch $RESTART_EPOCH 
```

其中 `--restart-epoch $RESTART_EPOCH` 参数是必要的，而 `$RESTART_EPOCH` 这个变量会由包装器设置，不需要用户理会。

包装器启动后就会把 Envoy 拉起来。包装器支持信号处理：

+ **SIGTERM**：将干净地终止所有子进程并退出。用于结束整个流程。

+ **SIGHUP**：将重新调用作为第一个参数传递给热重启程序的脚本，来进行热重启。

+ **SIGCHLD**：如果任何子进程意外关闭，那么重启脚本将关闭所有内容并退出以避免处于意外状态。随后，控制进程管理器应该重新启动重启脚本以再次启动 Envoy。这个信号通常又 Envoy 传递给包装器。

+ **SIGUSR1**：将作为重新打开所有访问日志的信号，转发给 Envoy。可用于原子移动以及重新打开日志轮转。

故使用时，可以通过向包装器发送信号来控制 Envoy 的生命周期。热重启时，可以通过 `kill -1 pid` 向包装器进程发送 **sighup** 信号，让其热重启。

# 源码分析
首先看 main 方法：

```python
def main():
  """ Script main. This script is designed so that a process watcher like runit or monit can watch
      this process and take corrective action if it ever goes away. """

  print("starting hot-restarter with target: {}".format(sys.argv[1]))

  signal.signal(signal.SIGTERM, sigterm_handler)
  signal.signal(signal.SIGHUP, sighup_handler)
  signal.signal(signal.SIGCHLD, sigchld_handler)
  signal.signal(signal.SIGUSR1, sigusr1_handler)

  # Start the first child process and then go into an endless loop since everything else happens via
  # signals.
  fork_and_exec()
  while True:
    time.sleep(60)
```

再看 `fork_and_exec` 方法：

```python
# ......
# 文件头定义了一个全局变量保存 epoch
restart_epoch = 0
# ......
def fork_and_exec():
  """ This routine forks and execs a new child process and keeps track of its PID. Before we fork,
      set the current restart epoch in an env variable that processes can read if they care. """

  # 引用全局变量
  global restart_epoch
  # 设置环境变量，主要是为了后续脚本使用
  os.environ['RESTART_EPOCH'] = str(restart_epoch)
  print("forking and execing new child process at epoch {}".format(restart_epoch))
  restart_epoch += 1

  child_pid = os.fork()
  if child_pid == 0:
    # Child process
    # 执行脚本
    os.execl(sys.argv[1], sys.argv[1])
  else:
    # Parent process
    print("forked new child process with PID={}".format(child_pid))
    # 将 pid 保存起来，退出时全部 kill 掉
    pid_list.append(child_pid)
```

# 参考

1. [官方文档](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/hot_restart.html) 关于热重启；
2. [Envoy hot restart](https://blog.envoyproxy.io/envoy-hot-restart-1d16b14555b5) 关于热重启设计的官方文档；
3. [官方文档](https://www.envoyproxy.io/docs/envoy/latest/operations/hot_restarter) 关于热重启包装器。

