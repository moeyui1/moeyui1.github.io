---
title: 通过Knative在Kubernetes上策划一次从源码到URL的部署
category: 开发
tags:
  - kubernetes
  - serverless
abbrlink: 7184eb1f
pubDate: 2019-03-09 22:35:11
description: ""
---

本文基于 knative 文档中的 [Orchestrating a source-to-URL deployment on Kubernetes](https://github.com/knative/docs/blob/master/serving/samples/source-to-url-go/README.md#orchestrating-a-source-to-url-deployment-on-kubernetes) 的简单例子，通过从源码到 URL 的部署流程一窥 Knative 给 Kubernetes 带来的改变。

<!-- more -->

## 环境需求
+ 一个安装了 Knative 的 Kubernetes 集群。如果你需要创建一个，按照[安装步骤](https://github.com/knative/docs/blob/master/install/README.md)来。
+ 安装并配置了 Go。这是可选的，仅当你想要在本地运行示例应用时需要。

## 配置 Knative

源码的构建是由 Knative build 子系统完成的，通常我们需要在构建配置中定义一些构建步骤(step)，通过这些构建步骤一步步地处理源码，详细可以参考 [Knative Build resources](https://github.com/knative/docs/blob/master/build/builds.md#knative-build-resources)。但 Knative 也支持使用多种构建模板，下文就介绍如何使用 kaniko 构建模板完成示例代码的构建。

### 安装 kaniko 构建模板

本示例借助 [kaniko build template](https://github.com/knative/build-templates/tree/master/kaniko) 来在你的 Kubernetes 集群上执行一次“从源码到容器”的构建。

> [kaniko](https://github.com/GoogleCloudPlatform/kaniko) 是谷歌开源的用于从 Dockerfile 构建容器镜像的工具。它的特点在于不依赖 Docker daemon，并在用户空间内执行 Dockerfile 中的每一行命令。这使得在一些不能方便地或安全地运行 Docker daemon 的环境中，如标准 Kubernetes 集群中，也能构建容器镜像。

使用 kubectl 来安装 kaniko：

```bash
kubectl apply --filename https://raw.githubusercontent.com/knative/build-templates/master/kaniko/kaniko.yaml
```

### 填写 Docker Hub 的密钥

为了将从源代码构建得到的容器推送到 Docker Hub，需要在 Kubernetes 上登记密钥用于认证 Docker Hub。

关于 Knative 中的认证，这是[详细的说明](https://github.com/knative/docs/blob/master/build/auth.md#basic-authentication-docker)，下面是几个关键步骤：

1. 创建一个 `Secret` 配置，用于存放你的 Docker Hub 认证信息。将文件保存为 `docker-secret.yaml`：

    ```yaml
    apiVersion: v1
    kind: Secret
    metadata:
      name: basic-user-pass
      annotations:
        build.knative.dev/docker-0: https://index.docker.io/v1/
    type: kubernetes.io/basic-auth
    data:
      # Use 'echo -n "username" | base64' to generate this string
      username: BASE64_ENCODED_USERNAME
      # Use 'echo -n "password" | base64' to generate this string
      password: BASE64_ENCODED_PASSWORD
    ```
1. 上面的配置中，`username` 和 `password` 都是需要 base64 加密的。在 macOS 或 Linux 系统中，用下面的命令可以生成 base64 编码的值：
    
    ```bash
    echo -n "username" | base64 -w 0
    echo -n "password" | base64 -w 0
    ```
    > 注意：如果在 macOS 上提示 "invalid option -w" 错误，试着改成`base64 -b 0`。
    
1. 创建一个`Service Account`配置，用于将构建进程链接到`Secret`。将文件保存为`service-account.yaml`：
    
    ```yaml
    apiVersion: v1
    kind: ServiceAccount
    metadata:
      name: build-bot
    secrets:
      - name: basic-user-pass
    ```
  
1. 创建好配置文件后，通过`kubectl`将它们应用到你的集群：

   ```bash
   kubectl apply -f docker-secret.yaml
   kubectl apply -f service-account.yaml
   ```
  
## 部署示例

本示例使用 [github.com/mchmarny/simple-app](https://github.com/mchmarny/simple-app) 作为一个基础 Go 应用，但你也可以替换为你自己的 GitHub 项目。唯一要注意的是，项目必须包含一个`Dockerfile`来描述如何为应用构建一个容器。

1. 需要创建一个 service 配置来定义服务如何部署，包括源代码在哪儿、使用哪个构建模板。创建`service.yaml`并复制如下定义。将`{DOCKER_USERNAME}`替换为你自己的 Docker Hub 用户名：

   ```yaml
    apiVersion: serving.knative.dev/v1alpha1
    kind: Service
    metadata:
      name: app-from-source
      namespace: default
    spec:
      runLatest:
        configuration:
          build:
            apiVersion: build.knative.dev/v1alpha1
            kind: Build
            spec:
              serviceAccountName: build-bot
              source:
                git:
                  url: https://github.com/mchmarny/simple-app.git
                  revision: master
              template:
                name: kaniko
                arguments:
                  - name: IMAGE
                    value: docker.io/{DOCKER_USERNAME}/app-from-source:latest
          revisionTemplate:
            spec:
              container:
                image: docker.io/{DOCKER_USERNAME}/app-from-source:latest
                imagePullPolicy: Always
                env:
                  - name: SIMPLE_MSG
                    value: "Hello from the sample app!"
   ```
1. 使用`kubectl`应用配置，并观察结果：
   
    ```bash
    kubectl apply -f service.yaml
    kubectl get po --watch
    ```
    输出类似于：
    
    ```bash
    NAME                          READY     STATUS       RESTARTS   AGE
    app-from-source-00001-zhddx   0/1       Init:2/3     0          7s
    app-from-source-00001-zhddx   0/1       PodInitializing   0         37s
    app-from-source-00001-zhddx   0/1       Completed   0         38s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   0/3       Pending   0         0s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   0/3       Pending   0         0s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   0/3       Init:0/1   0         0s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   0/3       Init:0/1   0         2s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   0/3       PodInitializing   0         3s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   2/3       Running   0         6s
    app-from-source-00001-deployment-6d6ff665f9-xfhm5   3/3       Running   0         11s

    ```
    能看到先是`app-from-source-00001`启动，执行“从源码到镜像”的过程，再启动`app-from-source-00001-deployment`拉取镜像，提供服务。
    
    需要特别说明的是，笔者这个步骤失败了多次，都是`app-from-source-00001`初始化过程意外退出。通过`kubectl describe`查看详细信息，提示构建超时（默认构建超时是10分钟）。构建过程需要拉取一些镜像，推测可能由于网络原因，该步骤耗时过长。可以在构建过程中，通过`kubectl describe po app-from-source-00001-zhddx`查看相关 Event，找到构建具体是在哪一步耗时过长。笔者最后多试几次成功了:)
    
1. 当你看到 deployment pod 变为`Running`状态时，`Ctrl+C`退出观察。此时你的容器已经完成构建和部署了！
1. 要检查服务的状态，可以
   
    ```bash
    kubectl get ksvc app-from-source --output yaml
    ```
1. 当你创建服务时，Knative 随即执行以下步骤：

    + 从 GitHub 拉取`revision`指定的代码并构建到容器中
    + 将容器推送到 Docker Hub
    + 为当前应用的版本创建一个新的不可变的`revision`
    + 通过网络编程为你的应用创建`route`、`ingress`、`service`和负载均衡服务
    + 自动伸缩你的 pods（包括缩至0个活动 pods）
    
1. 要获取你的集群的入口 IP，使用如下命令。如果你的集群是新建的，服务获取一个外部 IP 地址可能会花一些时间：
    
    ```bash
    # In Knative 0.2.x and prior versions, the `knative-ingressgateway` service was used instead of `istio-ingressgateway`.
    INGRESSGATEWAY=knative-ingressgateway
    
    # The use of `knative-ingressgateway` is deprecated in Knative v0.3.x.
    # Use `istio-ingressgateway` instead, since `knative-ingressgateway`
    # will be removed in Knative v0.4.
    if kubectl get configmap config-istio -n knative-serving &> /dev/null; then
        INGRESSGATEWAY=istio-ingressgateway
    fi
    
    kubectl get svc $INGRESSGATEWAY --namespace istio-system
    ```
    需要注意的是，minikube 搭建的集群通过上面的方式是获取不到外部 IP 的。应该执行：
    
    ```bash
    echo $(minikube ip):$(kubectl get svc $INGRESSGATEWAY --namespace istio-system --output 'jsonpath={.spec.ports[?(@.port==80)].nodePort}')
    ```
1. 要找到服务的 URL，输入：
    
   ```bash
   kubectl get ksvc app-from-source  --output=custom-columns=NAME:.metadata.name,DOMAIN:.status.domain
   ```
1. 现在你可以向你的应用发送一个请求来看看结果。将`{IP_ADDRESS}`替换为你上一步获得的地址：

   ```bash
   curl -H "Host: app-from-source.default.example.com" http://{IP_ADDRESS}
   ```
 
## 清理示例应用部署

要从你的集群移除示例应用，删除服务记录：

```bash
kubectl delete -f service.yaml
```