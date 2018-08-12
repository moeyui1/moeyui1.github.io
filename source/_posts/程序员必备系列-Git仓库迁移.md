---
title: 程序员必备系列-Git仓库迁移
categories: coding
tags:
  - coding
  - 版本控制
abbrlink: 42eebdae
date: 2016-05-29 18:07:22
---

## 1. 前言

虽然现在很多开源项目都选择将Git项目托管到Github上，但也有很多时候我们需要用私人的服务器做项目的版本控制，比如Gitlab。

但是万一自己的Gitlab崩了怎么办呢？。。。这应该是不可避免的事，这时候只能先将项目暂时迁移到Github上托管了。

<!--more-->

## 2. 迁移

Gitlab和Github都是管理Git项目的平台，所以迁移实际上很简单。

首先Gitlab和Github 上的项目链接是不同的，我们需要改动一下本地项目的远程设置：

```shell
git remote -v #查看当前远程链接
git remote remove origin #删除当前的链接
git remote add origin git@xxx.com:xxx #添加新的项目链接（也可以填https）
git --set-upstream-to origin/master #让本地的master分支对接远程master分支
git push -f #上传项目

```

这样就好了，push之后打开github就能看见项目了，而且Commit记录也都还在。

按照上面的方法，随时都可以迁移回Gitlab。