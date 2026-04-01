---
title: 小记flask网站部署到nginx主机
category: 网站
description: 小记flask框架编写的网站使用uwsgi部署到nginx主机上，并使用supervisor守护进程。
tags:
  - 网站
  - flask
  - python - uwsgi - nginx - supervisor
abbrlink: c2407c8a
pubDate: 2016-09-24 17:23:23
---

## 说说[flask](http://flask.pocoo.org/)

接触到`flask`之前只会用j2ee建站，现在看来`ssh`框架真是太重了ヽ(°◇° )ノ，果然还是适合ERP系统。个人要建个小站来玩玩的话，果然还是需要轻量级，容易上手，或者cool一点的框架啊ヽ(=^･ω･^=)丿。~~用wordpress感觉不够geek啊~~

贴一段官网的Hello World你们感受下：

```python
from flask import Flask
app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello World!"

if __name__ == "__main__":
    app.run()
```





## [uwsgi](https://github.com/unbit/uwsgi)

关于flask上手多简单多好用的开发过程此处省去一万字。。。网站写好了，该怎么部署呢？总不能用python运行main方法来部署吧。。。~~其实也不是不行~~

官方文档提供了[非常多方案](http://flask.pocoo.org/docs/0.11/deploying/)，考虑到手上的主机装有nginx，遂选择了`uWSGI`。

### 安装

没想到从安装这一步就坑住吾辈了。。。(๑°ㅁ°๑)‼

手上主机系统是`centos6.6`，不知道是不是源的问题，`yum install uwsgi`装下来的是很旧很旧的版本，然而网上各种文档和教程都是基于新版本。。。

> 说到这里就情不自禁婊一下python的各种库。一个两个更新得比西方记者还快，这本来到没有什么大问题，但是你们好歹做好向下兼容啊。。。今天说的`uwsgi`，以前用过的`scrapy`，甚至包括`python3`（万恶之源ヽ(ｏ`皿′ｏ)ﾉ）。。。毕竟不能和j2ee上那些屹立十几年的框架比稳定性。

既然uwsgi也是python库，那么直接`pip install uwsgi`就好了。

### uwsgi配置文件

使用uwsgi之前需要新建一个配置文件（当然你可以不用配置文件，命令后面跟一大坨参数。。）

这里贴出我的简化配置：

```ini
[uwsgi]
socket= /tmp/uwsgi.sock
module=PicWall:app	#picwall是我的项目名字
processes=4	#4个工作进程，提高并发处理能力
master=1
#permissions for the socket file
chmod-socket    = 666
```

这里说一下`chmod-socket`这个配置项，因为`/tmp/uwsgi.sock`这个文件收到Unix系统的权限管理，所以这里需要把它的权限改一下（此处设为了666）。

## 配置nginx

与`Gunicorn`这种Standalone的容器不同，uwsgi现在需要与nginx协作，站点的nginx配置文件作如下修改：

```nginx
location / {
                uwsgi_pass unix:///tmp/uwsgi.sock;
                include uwsgi_params;
        }
```



## 配置[supervisor](http://supervisord.org/index.html)

实际上做完以上工作之后运行

```shell
uwsgi --ini path #path是uwsgi配置文件路径
```

网站就可以访问了。但是为了使进程能稳定地在后台运行，吾辈选择使用supervisor来守护uwsgi的进程。

安装十分简单，`pip install supervisor`，也可以`yum install supervisor`之后需要找到supervisor默认配置文件，一般在/etc/下，名字是`supervisord.conf`具体位置不同系统、不同安装方式是不同的。

编辑默认配置文件，在文件末尾加上你需要运行的进程，简单的格式如下：

```
[program:picwallnew]
command= uwsgi --ini path/uwsgi.ini
directory=命令运行目录
user = root #运行身份
```

还可以通过参数配置进程意外结束自动重启等功能。