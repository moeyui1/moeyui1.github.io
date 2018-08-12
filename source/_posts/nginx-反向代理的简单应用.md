---
title: Nginx 反向代理的简单应用
categories: 网站
description: 前段时间pixiv.net也被墙了，看个图片都要挂ss甚是麻烦。于是想起Nginx的反代功能，顺手写了下配置文件发现也不是很复杂，便记录一下。
tags:
  - Nginx
  - 网站
abbrlink: eea1a03
date: 2018-04-01 21:31:14
---

# Nginx 反向代理的简单应用

## 动机

之前看过一个反代谷歌搜索的[Github项目](https://github.com/arnofeng/ngx_google_deployment)（没错我也在自己的机器上部署了这个反代谷歌搜索的服务 https://g.moeyui.cn），原理很简单，却非常实用。很多人翻墙不过是为了用谷歌而已，何必挂ss呢。通过这个反代项目，我可以随时随地，在任何设备上使用google搜索。

自然而然，就想到了反代`Pixiv`。

## 配置文件

整个过程十分简单，全都是通过`Nginx`的自带功能和插件实现的。

首先写个`www.pixiv.net`的代理：

```nginx

location / {
  proxy_redirect off;
  proxy_set_header Host "www.pixiv.net";
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_pass https://www.pixiv.net;
  proxy_set_header Referer https://www.pixiv.net;
}
```

由于`Pixiv`是需要登录的，这里首先需要解决的就是登录问题。

## `Pixiv`的登录过程

访问首页`www.pixiv.net`可以看到登录入口，然而点击登录按钮后，会跳转到`accounts.pixiv.net`下填写表单。表单提交到`accounts.pixiv.net`后会跳转回`www.pixiv.net`。

判断用户是否登录应该用到了Cookies，通过开发者工具看到两个域名都共享`pixiv.net`下的Cookies。

可以对`www.pixiv.net`的登录跳转做一些修改：

```nginx
subs_filter accounts.pixiv.net picwall.moeyui.cn/login;
```



所以还需要写一个`accounts.pixiv.net`的代理：

```nginx
location /login {
  proxy_redirect off;
  proxy_cookie_domain pixiv.net picwall.moeyui.cn;
  proxy_set_header Host "accounts.pixiv.net";
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_pass https://accounts.pixiv.net;
  proxy_set_header Referer https://www.pixiv.net;
}

```





虽然，挂个ss就可以解决被墙的问题，看起来好像很简单ho（笑。但实际，本来就是无聊的时候刷刷榜单而已，一想到要开ss，瞬间懒得刷了。。。

