---
title: Istio学习之Mixer
category: 开发
tags:
  - Istio
  - meituan
abbrlink: 1ae6a94b
pubDate: 2018-08-11 13:58:04
description: ""
---

Mixer 服务作为 Istio 和一套开放式基础设施之间的抽象层。Istio 组件和运行在 Service Mesh 中的服务，通过 Mixer 就可以在不直接访问后端接口的情况下和这些后端进行交互。

<!--more-->

# 简介

> Mixer 本质上是一个 Attributes 处理机。
>
> 每个经过 Envoy sidecar 的请求都会调用 Mixer，为 Mixer 提供一组描述 Request 和 Request 周围环境的属性。基于 Envoy sidecar 的配置和给定的特定属性集，Mixer 会调用各种基础设施后端。

![](https://oeoiy7i1f.qnssl.com/istio-mixer/mixer%E6%B5%81%E7%A8%8B.svg)

Mixer提供三个核心功能：

- 前置条件检查（Precondition Checking）：某一服务响应外部请求前，通过Envoy向Mixer发送Check请求，检查该请求是否满足一定的前提条件，包括白名单检查、ACL检查等。
- 配额管理（Quota Management）：当多个请求发生资源竞争时，通过配额管理机制可以实现对资源的有效管理。
- 遥测报告上报（Telemetry Reporting）：该服务处理完请求后，通过Envoy向Mixer上报日志、监控等数据。

首先介绍一些重要的概念。

## **Attribute（属性）**

大部分attributes由Envoy提供。Istio用 [attributes](https://preliminary.istio.io/docs/concepts/policy-and-control/attributes.html) 来控制服务在Service Mesh中运行时行为。attributes是有名称和类型的元数据，用来描述入口和出口流量和流量产生时的环境。Attributes 携带了一些具体信息，比如：API请求状态码、请求响应时间、TCP连接的原始地址等。

### RefrencedAttributes（被引用的属性）

refrencedAttributes是Mixer Check时进行条件匹配后被使用的属性的集合。Envoy向Mixer发送的Check请求中传递的是属性的全集，refrencedAttributes只是该全集中被应用的一个子集。

举个例子，Envoy某次发送的Check请求中发送的attributes为{request.path: xyz/abc, request.size: 234,source.ip: 192.168.0.1}，如Mixer中调度到的多个adapters只用到了request.path和request.size这两个属性。那么Check后返回的refrencedAttributes为{request.path: xyz/abc, request.size: 234}。

为防止每次请求时Envoy都向Mixer中发送Check请求，Mixer中建立了一套复杂的缓存机制，使得大部分请求不需要向Mixer发送Check请求。

并且Mixer中也是有缓存的，大概是下面的代码。。。位于*/Users/mengyikun/code/istio/mixer/pkg/api/grpcServer.go#Check*

```go
if s.cache != nil {
		if value, ok := s.cache.Get(protoBag); ok {
			resp := &mixerpb.CheckResponse{
				Precondition: mixerpb.CheckResponse_PreconditionResult{
					Status: rpc.Status{
						Code:    value.StatusCode,
						Message: value.StatusMessage,
					},
					ValidDuration:        value.Expiration.Sub(time.Now()),
					ValidUseCount:        value.ValidUseCount,
					ReferencedAttributes: &value.ReferencedAttributes,
				},
			}

			if status.IsOK(resp.Precondition.Status) {
				log.Debug("Check approved from cache")
			} else {
				log.Debugf("Check denied from cache: %v", resp.Precondition.Status)
			}

			if !status.IsOK(resp.Precondition.Status) || len(req.Quotas) == 0 {
				// we found a cached result and no quotas to allocate, so we're outta here
				return resp, nil
			}
		}
	}
```

![mixer-spof-myth-2.svg](https://oeoiy7i1f.qnssl.com/istio-miexer/mixer-spof-myth-2.svg)

## **Adapter（适配器）**

Mixer是一个高度模块化、可扩展组件，内部提供了多个适配器([adapter](https://link.jianshu.com/?t=https%3A%2F%2Fgithub.com%2Fistio%2Fistio%2Ftree%2Fmaster%2Fmixer%2Fadapter))。

Envoy提供request级别的属性（[attributes](https://link.jianshu.com/?t=https%3A%2F%2Fistio.io%2Fdocs%2Fconcepts%2Fpolicy-and-control%2Fattributes.html)）数据。

adapters基于这些attributes来实现日志记录、监控指标采集展示、配额管理、ACL检查等功能。Istio内置的部分adapters举例如下：

- [circonus](https://github.com/istio/istio/tree/master/mixer/adapter/circonus)：一个微服务监控分析平台。
- [fluentd](https://github.com/istio/istio/tree/master/mixer/adapter/fluentd)：一款开源的日志采集工具。
- [prometheus](https://github.com/istio/istio/tree/master/mixer/adapter/prometheus)：一款开源的时序数据库，非常适合用来存储监控指标数据。
- [statsd](https://github.com/istio/istio/tree/master/mixer/adapter/statsd)：一款采集汇总应用指标的工具。
- [stdio](https://github.com/istio/istio/tree/master/mixer/adapter/stdio)：stdio适配器使Istio能将日志和metrics输出到本地，结合内置的ES、Grafana就可以查看相应的日志或指标了。

Template author, adapter author, and the operator 的角色划分总结如下:

- The template author defines a *template*, which describes the data Mixer dispatches to adapters, and the interface that the adapter must implement to process that data. The supported set of templates within Mixer determines the various types of data an operator can configure Mixer to create and dispatch to the adapters.
- The adapter author selects the templates he/she wants to support based on the functionality the adapter must provide. The adapter author's role is to implement the required set of template-specific interfaces to process the data dispatched by Mixer at runtime.
- The operator defines what data should be collected ([instances](https://istio.io/docs/concepts/policy-and-control/mixer-config.html#instances)), where it can be sent ([handlers](https://istio.io/docs/concepts/policy-and-control/mixer-config.html#handlers)), and when to send it ([rules](https://istio.io/docs/concepts/policy-and-control/mixer-config.html#rules)).

![68747470733a2f2f63646e2e7261776769742e636f6d2f77696b692f697374696f2f697374696f2f696d616765732f6f7065...](https://oeoiy7i1f.qnssl.com/istio-mixer/mixer%E5%86%85%E9%83%A8%E7%BB%93%E6%9E%84.svg)

### Template

Template 是用 [ProtoBuff](https://developers.google.com/protocol-buffers/) 格式编写的。它定义了 Mixer 给 Adapter 的数据格式、Adapter 需要实现的接口等。Adapter 在调用 Template 时，实际上是调用从 proto 自动生成的Go文件。

![68747470733a2f2f63646e2e7261776769742e636f6d2f77696b692f697374696f2f697374696f2f696d616765732f74656d...](https://oeoiy7i1f.qnssl.com/istio-mixer/template%E6%96%87%E4%BB%B6%E5%AE%9A%E4%B9%89%E5%86%85%E5%AE%B9.svg)

每个 Adapter 都必须实现以下方法 :

- A Go struct that implements `HandlerBuilder` interfaces for all supported templates.
- A Go struct that implements `Handler` interfaces for all supported templates.

## Mixer 配置模型

- 配置一组 *handlers*，用于确定正在使用的适配器组及其操作方式。处理程序配置的一个例子：为 Statsd 后端提供带有 IP 地址的 statsd 适配器。
- 配置一组 *instances* ，描述如何将请求属性映射到适配器输入。实例表示一个或多个适配器将操作的大量数据。例如，运维人员可能决定从诸如 destination.service 和 response.code 之类的属性中生成 requestcount metric 实例。
- 配置一组 *rules*，这些规则描述了何时调用特定适配器及哪些实例。规则包含 *match* 表达式和 *action* 。匹配表达式控制何时调用适配器，而动作决定了要提供给适配器的一组实例。例如，规则可能会将生成的 requestcount metric 实例发送到 statsd 适配器。

### **Mixer适配器工作流程**

- Mixer server启动。 
  - 初始化adapter worker线程池。
  - 初始化 Mixer Template 仓库。
  - 初始化 adapter builder 表。
  - 初始化 runtime 实例。
  - 注册并启动gRPC server。
- 某一服务外部请求被envoy拦截，envoy根据请求生成指定的attributes，attributes作为参数之一向Mixer发起Check rpc请求。
- Mixer 进行前置条件检查和配额检查，调用相应的adapter做处理，并返回相应结果。
- Envoy分析结果，决定是否执行请求或拒绝请求。若可以执行请求则执行请求。请求完成后再向Mixer gRPC服务发起Report rpc请求，上报遥测数据。
- Mixer后端的adapter基于遥测数据做进一步处理。

![68747470733a2f2f63646e2e7261776769742e636f6d2f77696b692f697374696f2f697374696f2f696d616765732f6d6978...](https://oeoiy7i1f.qnssl.com/istio-mixer/mixer%E4%B8%8EAdapter%E4%BA%A4%E4%BA%92%E8%BF%87%E7%A8%8B.svg)

### **Check请求执行细节**

```go
func (s *grpcServer) Check(legacyCtx legacyContext.Context, req *mixerpb.CheckRequest) (*mixerpb.CheckResponse, error) {
    // 构造基于proto的属性包protoBag。protoBag提供了对一组attributes进行访问、修改的机制。
    protoBag := attribute.NewProtoBag(&req.Attributes, s.globalDict, s.globalWordList)
    defer protoBag.Done()

    // 构造可变的（执行check方法后会变化）属性包checkBag 
    checkBag := attribute.GetMutableBag(protoBag)
    defer checkBag.Done()
    // 执行dispatcher的预处理过程，s.dispatcher为runtime实例impl。
    // impl的Preprocess方法会调度生成属性相关的adapter，比如kubernetes adapter。
    s.dispatcher.Preprocess(legacyCtx, protoBag, checkBag);
    // 获取属性包中被引用的属性快照snapApa，snapApa能在每次check和quota处理中重复使用。
    snapApa := protoBag.SnapshotReferencedAttributes()
    // 执行dispatcher的前置条件检查，Check方法内部会计算被引用的属性并同步到protoBag中。
    cr, err := s.dispatcher.Check(legacyCtx, checkBag)
    ...
    // 构造Check rpc response实例
    resp := &mixerpb.CheckResponse{
        Precondition: mixerpb.CheckResponse_PreconditionResult{
            ValidDuration:        cr.ValidDuration,
            ValidUseCount:        cr.ValidUseCount,
            Status:               cr.Status,
            ReferencedAttributes: protoBag.GetReferencedAttributes(s.globalDict, globalWordCount),
        },
    }

    // 如果前置条件检查通过且配额表总数大于0，则计算新的配额
    if status.IsOK(resp.Precondition.Status) && len(req.Quotas) > 0 {
        resp.Quotas = make(map[string]mixerpb.CheckResponse_QuotaResult, len(req.Quotas))
        // 遍历配额表，计算每个配额是否为引用配额
        for name, param := range req.Quotas {
            qma := &dispatcher.QuotaMethodArgs{
                Quota:           name,
                Amount:          param.Amount,
                DeduplicationID: req.DeduplicationId + name,
                BestEffort:      param.BestEffort,
            }

            protoBag.RestoreReferencedAttributes(snapApa)
            crqr := mixerpb.CheckResponse_QuotaResult{}
            var qr *adapter.QuotaResult
            // 执行dispacher的配额处理方法。istio/mixer/pkg/runtime/dispatcher/dispatcher.go#func (d *Impl) Quota(）
            qr, err = s.dispatcher.Quota(legacyCtx, checkBag, qma)
            if err != nil {
                err = fmt.Errorf("performing quota alloc failed: %v", err)
                log.Errora("Quota failure:", err.Error())
            } else if qr == nil {
                crqr.ValidDuration = defaultValidDuration
                crqr.GrantedAmount = qma.Amount
            } else {
                if !status.IsOK(qr.Status) {
                    log.Debugf("Quota denied: %v", qr.Status)
                }
                crqr.ValidDuration = qr.ValidDuration
                crqr.GrantedAmount = qr.Amount
            }
            // 根据全局attribute字典来计算被引用的attributes
            crqr.ReferencedAttributes = protoBag.GetReferencedAttributes(s.globalDict, globalWordCount)
            resp.Quotas[name] = crqr
        }
    }
    // 返回Check gRPC相应结果
    return resp, nil
}
```

Report 请求类似。

# 总结

Mixer、Adapter 和 Operator Config 三者的关系如下图：

![68747470733a2f2f63646e2e7261776769742e636f6d2f77696b692f697374696f2f697374696f2f696d616765732f74656d...](https://oeoiy7i1f.qnssl.com/istio-mixer/%E6%80%BB%E7%BB%93.svg)

# 参考

1. [Istio源码解析系列part3—Mixer工作流程浅析](http://www.servicemesher.com/blog/istio-deepin-part3-mixer-workflow/)
2. [Mixer Compiled In Adapter Dev Guide](https://github.com/istio/istio/wiki/Mixer-Compiled-In-Adapter-Dev-Guide)