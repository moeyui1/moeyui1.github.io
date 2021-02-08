---
title: Kubernetes 国外镜像的网络问题
tags:
  - kubernetes
category: 开发
description: >-
  使用 Docker 或 K8s 时，经常需要拉取国外镜像，从 dockerhub 拉的镜像姑且不论，k8s 经常需要从 gcr.io 拉取镜像。手动搭建
  k8s 集群时，从 gcr.io 拉取镜像由于众所周知的网络问题，经常会失败。
abbrlink: 57c40a44
date: 2019-02-20 21:24:28
---

## 问题

使用 Docker 或 K8s 时，经常需要拉取国外镜像，从 dockerhub 拉的镜像姑且不论，k8s 经常需要从 gcr.io 拉取镜像。手动搭建 k8s 集群时，从 gcr.io 拉取镜像由于众所周知的网络问题，经常会失败。

## 解决思路

解决这种问题的一个办法是，将镜像复制一份到自己的仓库中，如 dockerhub 就为个人用户提供了免费的镜像仓库。

当然镜像并没有简单的复制功能。常规思路是，先在畅通的网络环境下（如搭建了代理的本地环境），执行

```bash
docker pull gcr.io/xxx
# 改名为 docker.io 的用户名下的镜像
docker tag gcr.io/xxx username/xxx
# 推送到远端镜像仓库
docker push username/xxx
```

## 通过 Github 自动构建
其实 dockerhub 支持联动 Github，通过指定 Github 上的 dockerfile 来自动构建镜像，省去了对代理网络环境的需要，可以使流程更简化。

### 建立 Github 仓库

首先建立一个 Github 仓库，用于存放 dockerfile，名字随意，如 "gcr-image"。然后直接在 Github 网页上 Create new file，内容只有一行，即直接引用目标镜像。

```dockerfile
FROM gcr.io/xxx
```

这个仓库可以存放多个 dockerfile，构建时按名字区分即可。

### 新建 Repository
接下来在 hub.docker.com 上点击 **Create Repository**（*没有账户的先注册账户*），然后在 Build Settings 中点击 Github 图标，关联 Github 账户：
![](https://user-gold-cdn.xitu.io/2019/2/20/16909b212fd45c9b?w=1382&h=962&f=jpeg&s=86167)
选定自己的 Github Repository，然后在 BUILD RULES 中填写镜像相关信息。根据需要修改 **Dockerfile location** 为 Github 中对应 dockerfile 文件。建议修改 Docker Tag 与 gcr.io 中目标镜像同步。
![](https://user-gold-cdn.xitu.io/2019/2/20/16909b483a0a42bc?w=1280&h=278&f=jpeg&s=30566)
最后 Create & Build 就好了，需要等待 dockerhub 构建一会儿。

### 使用
构建完毕后，使用时将配置文件中 gcr.io 镜像改为 dockerhub 上的镜像就可以了。dockerhub 上个人镜像一般是 `docker.io/yourusername/xxx` 的形式。同时,每次对 Github Repository 的变更，都会触发 dockerhub 自动构建镜像，在变更镜像版本的时候尤为方便。