---
title: vps搭建ss代理
category: 网络
tags:
  - 新手向
  - 网络
  - 科学上网
abbrlink: a93a43f1
pubDate: 2016-04-16 00:57:03
description: ""
---

上次我们介绍了如何选购一台vps，这次我们来谈谈在自己的vps上搭建ss搭理。

<!--more-->

## 1. ss版本
首先确定我们要安装的版本是服务端，而光是[ss官方github][1]上就有各种各样的版本，再加上网上五花八门的个人修改版，初学者恐怕难以适从。
这里简单说说几个吾辈用过的版本，以供参考。**选择一个合适的版本安装就好了。**
### 1. Python版
首先安装最简单最easy的应该就是Python版，这应该也是官方的主要版本。[官方wiki][2]写得很明白，这里小小地补充一下。
在debian或ubuntu下安装

    apt-get install python-pip  #我们需要先安装python环境
    pip install shadowsocks     #然后就可以一件安装ss

yum系同理，windows服务器的话，，，吾辈没试过，可以参考[官方的英文教程][3]。

安装好接下来填写配置文件（填法后面再提），按照官方中文wiki一步步走就好了。

但是吾辈不推荐Python版，你可以通过`free -m`指令来查看开启了ss之后的内存使用情况。因为一般个人买的vps都是小内存（1GB以内），而Python版并没有针对小内存服务器优化，所以一般不会选Python版。当然你要是只搭ss而且用的人很少，512M内存也可以带python，然而为什么不选择下面几个版本呢？

### 2. [go版][4]

上面也说了，其实没有必要选择Python版，其它版本一样可以满足我们的需求。比如go版，吾辈现在用的就是这个版本。你可以选择[按照官方教程来安装][5]，但我更推荐使用[秋水逸冰teddysun][6]的脚本，
依次输入下面的命令即可：

    wget --no-check-certificate https://raw.githubusercontent.com/teddysun/shadowsocks_install/master/shadowsocks-go.sh #下载脚本到当前目录
    chmod +x shadowsocks-go.sh  #更改脚本权限
    ./shadowsocks-go.sh 2>&1 | tee shadowsocks-go.log   #执行脚本
    
安装过程中会让你配置ss的密码端口，配置完后脚本会写到ss的配置文件中。
这个脚本转自[秋水逸冰teddysun的教程][7]，虽然脚本不是最新的（服务器的东西稳定优先），但胜在省时省力。顺便提醒一句，**所有的ss都需要手动添加开机自启动**，这个脚本已经加入了开机自启动的功能。
> 使用命令：
启动：`/etc/init.d/shadowsocks start`
停止：`/etc/init.d/shadowsocks stop`
重启：`/etc/init.d/shadowsocks restart`
状态：`/etc/init.d/shadowsocks status`
配置文件路径：*/etc/shadowsocks/config.json*

安装完了可以自行查看内存占用情况，你会发现占用比Python小。

卸载：`./shadowsocks-go.sh uninstall`

### 3. [libev版][8]

如果上面的go版的内存拯救还不够明显，吾辈严重推荐你上libv版，该版本使用 libev 和 C 编写，特点是内存占用极小，甚至可以安装在openwrt路由器上。缺点是没有官方支持（也不是很重要），以及，不能通过修改配置文件来实现多端口。当然你可以用过开多个使用不同配置的ss进程来实现多端口，但如果需要多端口还是推荐go版，也不差那点内存。
同样推荐[秋水逸冰teddysun][9]的脚本(适用于debian)，

    wget --no-check-certificate https://raw.githubusercontent.com/teddysun/shadowsocks_install/master/shadowsocks-libev-debian.sh
    chmod +x shadowsocks-libev-debian.sh
    ./shadowsocks-libev-debian.sh 2>&1 | tee shadowsocks-libev-debian.log

安装过程中会让你配置ss的密码端口，配置完后脚本会写到ss的配置文件中。
这个脚本转自[秋水逸冰teddysun的教程][10]，使用命令同go版，配置文件路径为*/etc/shadowsocks-libev/config.json*

卸载： `./shadowsocks-libev-debian.sh uninstall `

------

## 2. 配置ss

如果使用一件安装脚本，那么在安装的时候就已经生成了简单的配置文件，我们用vim打开配置文件，先确认你的vps安装了vim，

    apt-get install vim     #安装vim

然后再编辑配置文件（没有对应配置文件打开看到的将是空白文件，保存后会生成文件）：

    {
        "server":"0.0.0.0",     #可以不填，默认本机，用作客户端时修改
        "server_port":端口号,     #填一个端口号，一般填8000多吧，只要不冲突就好
        "local_address":"127.0.0.1",    #可以不填，指定本机地址
        "local_port":1080,      #可以不填，本机调用代理的时候需要用到
        "password":"密码",      #密码，需要用双引号
        "timeout":600,          #可以不填
        "method":"aes-256-cfb"  #加密方式有很多种，aes-256-cfb是较为常见的，推荐
    }

以上就是一个基本的配置文件，标注为可以不填的项可以不在配置文件中定义。如果你需要使用多端口（效果上差不多相当于多用户），参考下面的配置文件：

    {
    	"server_password": [
    		["8387", "foobar"],     #使用8387端口登录时密码为foobar,加密方式默认
    		["8388", "barfoo", "aes-128-cfb"]     #使用8388端口登录时密码为barfoo，加密方式为aes-128-cfb
    	]
    }
    
就是更改server_password的定义形式就好了，注意libev版不支持这样配置。
配置好之后通过`/etc/init.d/shadowsocks restart`重新启动ss服务来生效。

## 结尾吐槽
好的到这里服务端的ss配置就结束了，其实也很简单啊有没有觉得？这次写教程一张图片都没加，怪怪的。客户端的配置暂时没有打算写，感觉更加简单，，，而且教程一搜一大坨。但是考虑到Linux用户配置起来还是也可能会写一下。
顺便一提，吾辈在侧边栏加了一个“福利”界面，暂时是用来分享自用ss账号，不过想想还是不要写密码出来吧（一想到ishadowsocks那边被人用脚本定时获取账号密码），有需要的人估计也不是很多，所以直接微博问我要密码吧。微博基本不玩，这次把微博链接放上来也只是作为一个联系的方式，毕竟国人很少用Twitter等平台。


  [1]: https://github.com/shadowsocks
  [2]: https://github.com/shadowsocks/shadowsocks/wiki/Shadowsocks-%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E
  [3]: https://github.com/shadowsocks/shadowsocks/wiki/Install-Shadowsocks-Server-on-Windows
  [4]: http://shadowsocks.github.io/shadowsocks-go/
  [5]: http://shadowsocks.github.io/shadowsocks-go/
  [6]: https://teddysun.com/
  [7]: https://teddysun.com/392.html
  [8]: https://github.com/shadowsocks/shadowsocks-libev
  [9]: https://teddysun.com/
  [10]: https://teddysun.com/358.html