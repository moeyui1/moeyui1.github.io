---
title: Envoy 统计数据子系统源码分析
category: 开发
description: Envoy 中包含了一个精心设计的统计子系统，本文将从源码角度分析该子系统的设计目标及特点。
tags:
  - service mesh
  - envoy
  - 源码分析
abbrlink: 7c949937
date: 2018-09-25 00:10:42
---

关于 Envoy 监控的相关概念可以参考[官方博客](https://blog.envoyproxy.io/envoy-stats-b65c7f363342)。不过这篇博客有点旧，一些概念应以最新的代码为准。下面简单介绍一些基本概念。

# 设计初衷

关于为何 envoy 要设计一套复杂的统计子系统，这里直接引用官方的 blog 内容：

- 在任意数量工作线程下保持大致线性的吞吐量。换一种说法，在稳定状态下使用统计时，应该是没有跨线程抢占的。

  > Roughly linear throughput that scales with any number of worker threads. Said another way: at steady state there should be zero cross-thread contention when using stats. 

- 当使用热重启时，统计应该是逻辑上一致的。这意味着即使有两个Envoy线程在运行，所有的 counters、gauges 和 histograms 在逻辑上当作是一个进程内时，都应该是一致的。

  > When using hot restart, stats should be logically consistent. This means that even when there are two Envoy processes running, all of the counters, gauges, and histograms should be consistent when logically considered as a single process. (See the [hot restart post](https://medium.com/@mattklein123/envoy-hot-restart-1d16b14555b5) for more information on this). 

- 统计信息应包含在域（scopes）中，并以组为单位释放。域是包含共同前缀统计信息的逻辑分组。例如：`http.admin.*`。这一点由于Envoy的动态性而十分重要。Envoy支持多种管理APIs诸如监听器发现服务（LDS）和集群发现服务（CDS）APIs。为了不占满内存，Envoy 需要清理已经用不到的统计数据。

  > Stats should be contained within *scopes* and freed as a group. A scope is a logical grouping of stats with a common prefix. For example: http.admin.*. This is important because of the dynamic nature of Envoy. Envoy supports various [management APIs](https://lyft.github.io/envoy/docs/intro/arch_overview/dynamic_configuration.html) such as the Listener Discovery Service (LDS) and Cluster Discovery Service (CDS) APIs. In order to not run out of memory Envoy needs to clean up stats that are no longer used. 

- 统计域应该能覆盖和正确地进行引用计数.举个例子，域A使用了 `foo.bar.baz` ，域B也用了 `foo.bar.baz`，那么底层的 `foo.bar.baz` 应该引用计数为2。这对于热重启（某个时间段两个进程都会写同一个统计数据）和动态管理接口（某个时间段一个已更新的 listener 或 cluster 会与未更新的 listener 或 cluster 引用同一个统计数据）是必要的。

  > Stat scopes should be capable of being *overlapped* and properly reference counted. This means that if scope A uses a stat called *foo.bar.baz* and scope B also uses *foo.bar.baz*, the underlying *foo.bar.baz* stat should have a reference count of two. This is required both for hot restart (both processes will write to the same stats for some period of time) as well as for the dynamic management APIs (for some period of time an updated listener or cluster will reference the same stats as the old listener or cluster). 

- 对高低频统计数据的分别优化。

  > The stat subsystem should perform well for stats that may not be known until data plane processing starts. Many stats are essentially “fixed” and can be created when the configuration is loaded or the dynamic APIs reconfigure the data plane (e.g., cluster.foo.upstream_rq_5xx). These are both low frequency events. Other stats, such as detailed HTTP response code metrics (e.g., cluster.foo.upstream_rq_503), are not known until data starts flowing. Using “dynamic” stats is never going to be as fast as using “fixed” stats but performance should still be adequate even when processing 10's of thousands of requests per second per core.

# Overview

首先介绍开源界监控的一般解决方案，以 dogstatd 为例：

[![iulKMV.png](https://s1.ax1x.com/2018/09/23/iulKMV.png)](https://imgchr.com/i/iulKMV)

其中 DogStatsd 单独部署，负责聚合、收集统计数据，为 Envoy 中 Sink 一角。下文主要讨论处于 DogStatsd 下游的应用代码中的实现，探究 Envoy 如何处理统计数据，并将它们发给 Sink 的。

Envoy 目前支持3种监控指标类型：

- Counters（计数器）：无符号整数只增不减，如总请求数；
- Gauges（量表）：无符号整数可增可减，如目前有效请求数；
- Histograms（直方图）：作为值流的一部分的无符号整数，然后由收集器进行汇总以最终生成汇总百分点值。 例如，上游请求时间。

在内部，计数器和计量器被分批并定期冲洗以提高性能。直方图会在收到时写入。 注意：以前称为定时器的内容已成为直方图，因为这两种表示法之间的唯一区别就是单位（秒和毫秒）。

# 结构

[![iul8IJ.png](https://s1.ax1x.com/2018/09/23/iul8IJ.png)](https://imgchr.com/i/iul8IJ)

上图是统计系统的大体结构。

## Store

> The stat store is a singleton within Envoy and provides a simple interface by which the rest of the code can obtain handles to scopes, counters, gauges, and histograms. Calling code is responsible for maintaining ownership semantics of any created scopes. When a scope is destroyed, all of the contained stats have their reference count decreased by one. If any stats reach a reference count of zero they will be freed.

由于 Store 的实现比较贴近底层，主要考虑内存管理、锁方面的问题，故本文不做深入分析。

```c++
/**
 * A store for all known counters, gauges, and timers.
 */
class Store : public Scope {
public:
  /**
   * @return a list of all known counters.
   */
  virtual std::vector<CounterSharedPtr> counters() const PURE;

  /**
   * @return a list of all known gauges.
   */
  virtual std::vector<GaugeSharedPtr> gauges() const PURE;

  /**
   * @return a list of all known histograms.
   */
  virtual std::vector<ParentHistogramSharedPtr> histograms() const PURE;
};
```

## Stats

As described previously, stats include counters, gauges, and histograms. From an end user perspective, these interfaces are very simple to use. For example, counters and gauges include an inc() and dec() method while only gauges include a set() method. Any underlying storage complexity is hidden from the programmer.

## Flusher

To achieve high performance, Envoy internally buffers all stat changes using atomic CPU instructions. At a configurable interval all of the counters and gauges are flushed to the sinks. Note that in the current architecture *histogram values are sent directly to the sinks*. This will be described in more detail below. The flusher runs on the main thread.

## Sinks

A stat sink is an interface that takes generic stat data and translates it into a backend-specific wire format. All sinks utilize TLS so that there is no contention when flushing output. In practice however, only the main thread currently flushes counters and gauges. All threads flush histograms.

Currently, Envoy only supports the TCP and UDP [statsd](https://github.com/b/statsd_spec) protocol. statsd is an incredibly simple but very widely supported transport format. In the future it is very likely that other native stat sinks will be implemented, such as [Prometheus](https://prometheus.io/), [Wavefront](https://www.wavefront.com/), and [InfluxDB](https://www.influxdata.com/). Note also that Envoy does not currently support *dimensional* or *tagged* stats. This will be discussed further in the future work section below.

The built-in stats sinks are:

- [envoy.statsd](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/stats.proto#envoy-api-msg-config-metrics-v2-statsdsink)
- [envoy.dog_statsd](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/stats.proto#envoy-api-msg-config-metrics-v2-dogstatsdsink)
- [envoy.metrics_service](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/metrics_service.proto#envoy-api-msg-config-metrics-v2-metricsserviceconfig)
- [envoy.stat_sinks.hystrix](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/stats.proto#envoy-api-msg-config-metrics-v2-hystrixsink)

## Admin

From an operations perspective, it is incredibly useful to be able to get onto a node and dump the current stats in realtime. Envoy enables this via the /stats [admin endpoint](https://lyft.github.io/envoy/docs/operations/admin.html#get--stats). The admin endpoint looks directly into the store to load all of the counters and gauges and print them. This endpoint does not currently output any histogram data. This again is due to the fact that in the current implementation histogram values are written directly to the sinks so the store does not know about them.

# 源码追踪

## 执行流程

### 数据推送

流程复杂又繁琐，整理了一下[思维导图](https://oeoiy7i1f.qnssl.com/envoy_stats.xmind)。粗略地讲，就是定时调用 `Stats::Sink` 的 flush 方法，将 `Stats::Source` 中的统计数据推给 sink。

### 埋点

envoy 这一套抽象得很好，在埋点的时候使用的实际是 `Stats::Store`，将数据存到本地的 cache 中，再通过上文的“数据推送”定时推到后端的 sink。下面以 `envoy/source/extensions/filters/network/ratelimit/ratelimit.cc` 为例追踪下埋点的源码实现，比较复杂繁琐，可以选择性跳过，简单来说就是埋点处对 store 层数据进行修改。

#### Network::FilterStatus Filter::onNewConnection()

```c++
//...
  if (status_ == Status::NotStarted) {
    status_ = Status::Calling;
    config_->stats().active_.inc();
    config_->stats().total_.inc();
    calling_limit_ = true;
    client_->limit(*this, config_->domain(), config_->descriptors(), Tracing::NullSpan::instance());
    calling_limit_ = false;
  }
//...
```

该方法中有一处埋点，调用了 `config_` 变量的 `stats()` 方法。`config_` 实际上是一个 `RateLimitFilter::Config` 类型的实例。`stats()` 返回 `config_` 持有的一个 `InstanceStats` 类型的引用。下面看 `InstanceStats` 的代码。

#### RateLimitFilter::InstanceStats

```c++
/**
 * Struct definition for all tcp rate limit stats. @see stats_macros.h
 */
struct InstanceStats {
  ALL_TCP_RATE_LIMIT_STATS(GENERATE_COUNTER_STRUCT, GENERATE_GAUGE_STRUCT)
};
```

有点懵逼，这货是一个结构体。。。还用了几个莫名其妙的宏。。。先看 `ALL_TCP_RATE_LIMIT_STATS` 写的啥：

```c++
/**
 * All tcp rate limit stats. @see stats_macros.h
 */
// clang-format off
#define ALL_TCP_RATE_LIMIT_STATS(COUNTER, GAUGE)                                         \
  COUNTER(total)                                                                         \
  COUNTER(error)                                                                         \
  COUNTER(over_limit)                                                                    \
  COUNTER(ok)                                                                            \
  COUNTER(failure_mode_allowed)                                                          \
  COUNTER(cx_closed)                                                                     \
  GAUGE  (active)
// clang-format on
```

丫的是个嵌套宏，，，大意是执行传入参数 COUNTER, GAUGE 的宏。注释提到了 `stats_macros.h` ，看下：

```c++
#pragma once

#include <string>

#include "envoy/stats/histogram.h"
#include "envoy/stats/stats.h"

namespace Envoy {
/**
 * These are helper macros for allocating "fixed" stats throughout the code base in a way that
 * is also easy to mock and test. The general flow looks like this:
 *
 * Define a block of stats like this:
 *   #define MY_COOL_STATS(COUNTER, GAUGE, HISTOGRAM) \
 *     COUNTER(counter1)
 *     GAUGE(gauge1)
 *     HISTOGRAM(histogram1)
 *     ...
 *
 * Now actually put these stats somewhere, usually as a member of a struct:
 *   struct MyCoolStats {
 *     MY_COOL_STATS(GENERATE_COUNTER_STRUCT, GENERATE_GAUGE_STRUCT, GENERATE_HISTOGRAM_STRUCT)
 *   };
 *
 * Finally, when you want to actually instantiate the above struct using a Stats::Pool, you do:
 *   MyCoolStats stats{
 *     MY_COOL_STATS(POOL_COUNTER(...), POOL_GAUGE(...), POOL_HISTOGRAM(...))};
 */

#define GENERATE_COUNTER_STRUCT(NAME) Stats::Counter& NAME##_;
#define GENERATE_GAUGE_STRUCT(NAME) Stats::Gauge& NAME##_;
#define GENERATE_HISTOGRAM_STRUCT(NAME) Stats::Histogram& NAME##_;

#define FINISH_STAT_DECL_(X) + std::string(#X)),

#define POOL_COUNTER_PREFIX(POOL, PREFIX) (POOL).counter(PREFIX FINISH_STAT_DECL_
#define POOL_GAUGE_PREFIX(POOL, PREFIX) (POOL).gauge(PREFIX FINISH_STAT_DECL_
#define POOL_HISTOGRAM_PREFIX(POOL, PREFIX) (POOL).histogram(PREFIX FINISH_STAT_DECL_

#define POOL_COUNTER(POOL) POOL_COUNTER_PREFIX(POOL, "")
#define POOL_GAUGE(POOL) POOL_GAUGE_PREFIX(POOL, "")
#define POOL_HISTOGRAM(POOL) POOL_HISTOGRAM_PREFIX(POOL, "")
} // namespace Envoy
```

大体意思看注释就知道了，这个宏主要是方便生成一个统计的数据结构。那将 `InstanceStats` 理解为一个数据结构即可，它的成员有 `Stats::Counter` 和 `Stats::Gauge` 。

#### Stats::Counter

以 Counter 为例看下源码：

```c++
/**
 * An always incrementing counter with latching capability. Each increment is added both to a
 * global counter as well as periodic counter. Calling latch() returns the periodic counter and
 * clears it.
 */
class Counter : public virtual Metric {
public:
  virtual ~Counter() {}
  virtual void add(uint64_t amount) PURE;
  virtual void inc() PURE;
  virtual uint64_t latch() PURE;
  virtual void reset() PURE;
  virtual uint64_t value() const PURE;
};
```

这样一看，执行流程就明白了。回过头来 `InstanceStat` 是如何被初始化的呢？这个 Counter 的具体实现是什么？

#### InstanceStat 初始化

`envoy/source/extensions/filters/network/ratelimit/ratelimit.cc` 下有一段代码生成 `InstanceStat`：

```c++
InstanceStats Config::generateStats(const std::string& name, Stats::Scope& scope) {
  std::string final_prefix = fmt::format("ratelimit.{}.", name);
  return {ALL_TCP_RATE_LIMIT_STATS(POOL_COUNTER_PREFIX(scope, final_prefix),
                                   POOL_GAUGE_PREFIX(scope, final_prefix))};
}
```

结合前面 `stats_macros.h` 的源码来看，实际调用了 `scope.counter()` 方法。看下 scope 代码。

#### Stats::Scope

```c++
#pragma once

#include <cstdint>
#include <memory>
#include <string>

#include "envoy/common/pure.h"
#include "envoy/stats/histogram.h"
#include "envoy/stats/stats_options.h"

namespace Envoy {
namespace Stats {

class Counter;
class Gauge;
class Histogram;
class Scope;
class StatsOptions;

typedef std::unique_ptr<Scope> ScopePtr;
typedef std::shared_ptr<Scope> ScopeSharedPtr;

/**
 * A named scope for stats. Scopes are a grouping of stats that can be acted on as a unit if needed
 * (for example to free/delete all of them).
 */
class Scope {
public:
  virtual ~Scope() {}

  /**
   * Allocate a new scope. NOTE: The implementation should correctly handle overlapping scopes
   * that point to the same reference counted backing stats. This allows a new scope to be
   * gracefully swapped in while an old scope with the same name is being destroyed.
   * @param name supplies the scope's namespace prefix.
   */
  virtual ScopePtr createScope(const std::string& name) PURE;

  /**
   * Deliver an individual histogram value to all registered sinks.
   */
  virtual void deliverHistogramToSinks(const Histogram& histogram, uint64_t value) PURE;

  /**
   * @return a counter within the scope's namespace.
   */
  virtual Counter& counter(const std::string& name) PURE;

  /**
   * @return a gauge within the scope's namespace.
   */
  virtual Gauge& gauge(const std::string& name) PURE;

  /**
   * @return a histogram within the scope's namespace with a particular value type.
   */
  virtual Histogram& histogram(const std::string& name) PURE;

  /**
   * @return a reference to the top-level StatsOptions struct, containing information about the
   * maximum allowable object name length and stat suffix length.
   */
  virtual const Stats::StatsOptions& statsOptions() const PURE;
};

} // namespace Stats
} // namespace Envoy
```

可看到获取的是 scope 下的一个 counter，具体实现的 scope 是 `Stats::IsolatedScopeImpl` 。

#### Stats::IsolatedScopeImpl

```c++
struct IsolatedScopeImpl : public Scope {
  IsolatedScopeImpl(IsolatedStoreImpl& parent, const std::string& prefix)
      : parent_(parent), prefix_(Utility::sanitizeStatsName(prefix)) {}

  // Stats::Scope
  ScopePtr createScope(const std::string& name) override {
    return ScopePtr{new IsolatedScopeImpl(parent_, prefix_ + name)};
  }
  void deliverHistogramToSinks(const Histogram&, uint64_t) override {}
  Counter& counter(const std::string& name) override { return parent_.counter(prefix_ + name); }
  Gauge& gauge(const std::string& name) override { return parent_.gauge(prefix_ + name); }
  Histogram& histogram(const std::string& name) override {
    return parent_.histogram(prefix_ + name);
  }
  const Stats::StatsOptions& statsOptions() const override { return parent_.statsOptions(); }

  IsolatedStoreImpl& parent_;
  const std::string prefix_;
};
```

可看到实际用了 `IsolatedStoreImpl` 的 `counter(name)` 方法。

#### Stats::IsolatedStoreImpl

`IsolatedStoreImpl` 是 `Stats::Store` 的一个子类，结合前文的概念，就知道这里终于走到了 store 层。

```C++
class IsolatedStoreImpl : public Store {
public:
  IsolatedStoreImpl();

  // Stats::Scope
  Counter& counter(const std::string& name) override { return counters_.get(name); }
  ScopePtr createScope(const std::string& name) override;
  void deliverHistogramToSinks(const Histogram&, uint64_t) override {}
  Gauge& gauge(const std::string& name) override { return gauges_.get(name); }
  Histogram& histogram(const std::string& name) override {
    Histogram& histogram = histograms_.get(name);
    return histogram;
  }
  const Stats::StatsOptions& statsOptions() const override { return stats_options_; }

  // Stats::Store
  std::vector<CounterSharedPtr> counters() const override { return counters_.toVector(); }
  std::vector<GaugeSharedPtr> gauges() const override { return gauges_.toVector(); }
  std::vector<ParentHistogramSharedPtr> histograms() const override {
    return std::vector<ParentHistogramSharedPtr>{};
  }

private:
  HeapStatDataAllocator alloc_;
  IsolatedStatsCache<Counter> counters_;
  IsolatedStatsCache<Gauge> gauges_;
  IsolatedStatsCache<Histogram> histograms_;
  const StatsOptionsImpl stats_options_;
};
```

`counter(name)` 方法其实就是从一个 vector 中获取对应 counter。

## Source

先介绍下 `Stats::Source` ，通过这个类，可以访问缓存中的统计数据。

```c++
/**
 * Provides cached access to a particular store's stats.
 */
class Source {
public:
  virtual ~Source() {}

  /**
   * Returns all known counters. Will use cached values if already accessed and clearCache() hasn't
   * been called since.
   * @return std::vector<CounterSharedPtr>& all known counters. Note: reference may not be valid
   * after clearCache() is called.
   */
  virtual const std::vector<CounterSharedPtr>& cachedCounters() PURE;

  /**
   * Returns all known gauges. Will use cached values if already accessed and clearCache() hasn't
   * been called since.
   * @return std::vector<GaugeSharedPtr>& all known gauges. Note: reference may not be valid after
   * clearCache() is called.
   */
  virtual const std::vector<GaugeSharedPtr>& cachedGauges() PURE;

  /**
   * Returns all known parent histograms. Will use cached values if already accessed and
   * clearCache() hasn't been called since.
   * @return std::vector<ParentHistogramSharedPtr>& all known histograms. Note: reference may not be
   * valid after clearCache() is called.
   */
  virtual const std::vector<ParentHistogramSharedPtr>& cachedHistograms() PURE;

  /**
   * Resets the cache so that any future calls to get cached metrics will refresh the set.
   */
  virtual void clearCache() PURE;
};
```

## Sink

上面的流程追踪到 `sink->flush(source)` 方法，这里的 sink 实际是 `Stats::Sink` 的子类，具体的实现类在 `envoy/source/extensions/stat_sinks` 文件夹下，有

- [envoy.statsd](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/stats.proto#envoy-api-msg-config-metrics-v2-statsdsink) 支持 TCP/UDP
- [envoy.dog_statsd](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/stats.proto#envoy-api-msg-config-metrics-v2-dogstatsdsink)
- [envoy.metrics_service](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/metrics_service.proto#envoy-api-msg-config-metrics-v2-metricsserviceconfig) 后端接一个符合某种标准的 grpc sink；
- [envoy.stat_sinks.hystrix](https://www.envoyproxy.io/docs/envoy/latest/api-v2/config/metrics/v2/stats.proto#envoy-api-msg-config-metrics-v2-hystrixsink) 暴露一个 url ，提供流式信息输出

其中 statsd 和 dog_statsd 都是基于 statsd 格式，故使用 `stat_sinks/common/statsd` 下的共通代码。下面以 `envoy/source/extensions/stat_sinks/common/statsd/statsd.cc` 为例分析：

```c++
//...
void UdpStatsdSink::flush(Stats::Source& source) {
  Writer& writer = tls_->getTyped<Writer>();
  for (const Stats::CounterSharedPtr& counter : source.cachedCounters()) {
    if (counter->used()) {
      uint64_t delta = counter->latch();
      writer.write(fmt::format("{}.{}:{}|c{}", prefix_, getName(*counter), delta,
                               buildTagStr(counter->tags())));
    }
  }

  for (const Stats::GaugeSharedPtr& gauge : source.cachedGauges()) {
    if (gauge->used()) {
      writer.write(fmt::format("{}.{}:{}|g{}", prefix_, getName(*gauge), gauge->value(),
                               buildTagStr(gauge->tags())));
    }
  }
}
//...
```

如上是一个 Sink 子类的 flush 方法实现。可看到 statsd 是如何从 source 中取出所需数据的。

# 总结

回过头来看 envoy 为何这么设计，实际上与本文开头的设计初衷对应：

- **Linear throughput（线性吞吐）:** At steady state, all stat allocations occur via the scope TLS cache. This requires no locks and scales very well to a high number of workers.
- **Logically consistent during hot restart（热重启期间的逻辑一致）**: Ultimately, all stats with the same name use the same backing storage in shared memory. This creates logical consistency between processes.
- **Stats are contained within a scope, can be freed as a group, and can be overlapped（以scope为单位保存，以组为单位释放，可覆盖）**: Scope 是具有相同前缀统计数据的逻辑集合。Scopes have completely independent central caches and TLS caches, along with independent per-stat reference counting. A scope can be removed and all of its stats will have their reference counts decremented and will potentially be freed.
- **Adequate performance for dynamic stats**: Lookups for dynamic stats happen via the scope TLS cache and use an O(1) hash table.