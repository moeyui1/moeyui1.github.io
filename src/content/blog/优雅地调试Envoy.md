---
title: 优雅地调试 Envoy
tags:
  - Envoy
category: 开发
abbrlink: 9cf44367
pubDate: 2018-08-12 14:02:31
description: ""
---

最终的效果如图。Envoy 运行在 Docker 中（也可以运行在别的Linux系统中），本地 osx 上的 vscode 可视化调试。

![1534049456936.jpg](https://oeoiy7i1f.qnssl.com/%E4%BC%98%E9%9B%85%E5%9C%B0%E8%B0%83%E8%AF%95%20Envoy/vscode%E8%B0%83%E8%AF%95envoy.jpg)

<!--more-->

# 简述

原理也很简单，通过 gdb 远程调试功能远程连接到 Linux 内的 gdb 即可。但这样一来也有一些缺陷，一些动态 so 文件和系统库文件就没法可视化了。

调试端系统为 OSX ，运行端系统为 Linux。情况有点特殊。

*OSX 下调试 Envoy 很麻烦，做过一些尝试但是似乎 build 不出来带符号连接的二进制文件。而且 gdb 要自签名才能用，不知为何我机子签名到最后一步会报错，遂放弃。*

# 详细步骤

## 运行 Envoy

依照官方推荐用 Docker 运行，简单方便，也没有复杂的依赖问题。根据官方文档，带 debug 信息的镜像似乎只有 `envoyproxy/envoy-alpine-debug` 这个镜像。故

```shell
docker run  --cap-add=SYS_PTRACE --security-opt seccomp=unconfined  -v ~/code/envoy/source/:/source/ -p9999:9999  envoyproxy/envoy-alpine-debug
```

- `--cap-add=SYS_PTRACE --security-opt seccomp=unconfined` ：因为 docker 存在一些安全机制，如果不加这个参数，gdb 就不能 attach 到 Envoy 进程中，提示 Permission denied.
- `-v ~/code/envoy/source/:/source/` ：把容器外的源码挂载到 docker 内，因为镜像中不含源码。但是既然使用了远程调试，**不挂过去也可以的**。挂过去就可以在容器内用 gdb 进行调试。
- `-p9999:9999` ：gdb 远程调试需要占用一个端口，可以任选一个端口暴露出来。本文使用9999.

## 容器内安装 gdb

跑起来后进到容器内

```shell
docker exec -ti 容器ID /bin/sh
```

安装 gdb。 [Alpine](https://alpinelinux.org/) 的软件包中没有 gdb server，且它的 gdb 包也没有包含 gdb server，只好手动下载编译

```shell
apk add --no-cache make
apk add --no-cache linux-headers
apk add --no-cache texinfo
apk add --no-cache gcc
apk add --no-cache g++

# gdb 版本请随意，这里选用了8.1
wget http://ftp.gnu.org/gnu/gdb/gdb-8.1.tar.xz
tar -xvf gdb-8.1.tar.xz
cd gdb-8.1
./configure --prefix=/usr
make
make -C gdb install
```

上述方法在 docker 下实际上是很糟糕的实践，如果这种调试方法通用化，应该建立自己的镜像文件，其中可以加上以下语句，自动安装 gdb 和 gdb server

```dockerfile
...
RUN apk update
# we need make and linux-headers to compile gdb
RUN apk add --no-cache make
RUN apk add --no-cache linux-headers
RUN apk add --no-cache texinfo
RUN apk add --no-cache gcc
RUN apk add --no-cache g++
RUN apk add --no-cache gfortran
# install gdb
# RUN apk add --no-cache gdb
RUN mkdir gdb-build ;\
    cd gdb-build;\
    wget http://ftp.gnu.org/gnu/gdb/gdb-7.11.tar.xz;\
    tar -xvf gdb-7.11.tar.xz;\
    cd gdb-7.11;\
    ./configure --prefix=/usr;\
    make;\
    make -C gdb install;\
    cd ..;\
    rm -rf gdb-build/;
...
```

## 启动 gdb server

用 ps 查看 Envoy 的进程 ID，然后运行 gdb server

```shell
gdbserver localhost:9999 --attach 8 # --attach 后跟进程 ID ，本文中 ID 为8
```

## 宿主机安装 gdb

在这之前 osx 上要安装 gdb，**安装gdb必须使用--with-all-targets参数**，因为默认安装是基于机子操作系统的结构体系，而远程调试的机子不一定与本机相同，使用该参数主要是适配远程各种平台的结构体系，当然可以下载gdb源码，修改配置中结构体系配置编译安装，这部分读者自行google。

```shell
brew install gdb --with-all-targets 
```

到这一步就可以用 gdb 远程调试了，启动 gdb ，在 gdb 中输入以下命令：

```shell
target remote localhost:9999 # 连接远程
symbol-file /usr/local/bin/envoy    # 加入符号文件，可执行文件包含符号文件，/usr/local/bin/envoy为远程主机编译，通过scp来拷贝到本机
continue            # 执行调试过程，不是run，因为gdbserver已经启动程序了，后续就可以使用gdb过程。
```

需要注意的是符号文件应使用容器内编译好的二进制文件。可以想办法从容器内拷贝到容器外，可以 scp ，也可以拷贝到共享目录。

另：gdb 调试也不错，但是更推荐 [cgdb](https://cgdb.github.io/) ，界面更人性化。

## vscode 设置

如果想在 vscode 上调试，还需要在 vscode 的 launch.json 中添加如下配置：

```json
{
            "name":"gdb Launch",
            "type": "cppdbg",
            "request": "launch",
            "program": "/usr/local/bin/envoy", //指定二进制文件路径，从容器内拷出来
            "miDebuggerServerAddress": "localhost:9999",
            "setupCommands": [{
                "description": "Enable pretty-printing for gdb",
                "text": "-enable-pretty-printing",
                "ignoreFailures": true
            },
            {
                "text": "set sysroot"    //不加载远程so文件，不调试动态链接库，跳过read xxx.so from remote target，能减少每次调试准备时间
            }
            ],
            "args": [],
            "stopAtEntry": false,
            "cwd": "${workspaceRoot}",
            "environment": [],
            "externalConsole": true,
            "MIMode": "gdb"
}
```

ok，到这里就大功告成，从 vscode 中启动就可以连接到容器内的 gdb server 了。效果如本文开头的图片

![1534049456936.jpg](https://oeoiy7i1f.qnssl.com/%E4%BC%98%E9%9B%85%E5%9C%B0%E8%B0%83%E8%AF%95%20Envoy/vscode%E8%B0%83%E8%AF%95envoy.jpg)

# 参考

1. [How to install gdbserver package on Alpine Docker image?](https://stackoverflow.com/questions/37186990/how-to-install-gdbserver-package-on-alpine-docker-image)

2. [GDB配置（打印STL容器、VS code配置、远程调试debug）](https://blog.csdn.net/matrix_zzl/article/details/78578091#3gdb-gdbserver%E8%BF%9C%E7%A8%8B%E8%B0%83%E8%AF%95)