---
title: 小记JAVAFX-Maven-Html项目路径引用
category: coding
tags:
  - 日记向
abbrlink: 297d577b
date: 2016-07-18 08:41:11
---


本来java的路径引用还是很宽松的，你可以用相对路径、绝对路径、`getClass()`获取类路径甚至获取运行项目路径。然而扯上maven之后就不得不规范起来，因为maven项目打包前后目录结构差别较大，这之后扯上javaFX的各种fxml文件引用更是让人蛋疼。更不提拉上html之后应用js文件的不同规范。。。

<!--more-->
## maven项目的标准引用

maven项目在打包时会将resource下的资源文件和java目录下的源代码一起放到根目录下，所以简单地用`项目路径/resouce/*`来引用是不对的，根本没有java和resource这两个文件夹了。

这时就需要我们用`this.getClass().getResource("路径")`这样的方法啦，在读写文件的时候可能需要**InputStream**对象，此时使用`this.getClass().getResourceAsStream("路径")`。

### 不同目录层级的引用

一般来说都通过`../`可以表示上一级目录，通过`./`可以表示当前目录，这种常识在调试项目的时候或许是行得通的，然而打包出来的maven却不能识别这种标识。这里吾辈也没有找到好方法，最后在项目中只好使用`/目录名/...`的形式。这种形式是在路径名前加一个`/`这样代表直接从项目根目录开始检索，不使用相对路径。

## javaFX项目的fxml文件

javaFX可以通过读取fxml文件完成界面的配置，相比代码编写界面，这种方法拥有可视化的优点，而这个可视化设计的优点主要依赖于Oracle的**Sence Builder**这款软件，它可以将fxml文件与其对应的controller类绑定起来，提供友好的可视化设计。

然而，，javaFX现今尴尬的处境，导致Sence Builder也基本处于半弃坑的状态，重要的一点是，它只能自动帮用户将同一目录下的controller和fxml文件绑定起来。。而按照maven的思想，fxml文件应该放在resource文件夹下，虽然编译后resource文件夹和java文件夹会合并，但开发的时候Sence Builder就会找不到对应的controller文件，无法提供可视化设计。。。

### maven编译资源文件

为了开发的时候更方便一些，我们选择将fxml文件放在与controller类同一目录下。但是默认情况下maven是不会编译源码文件夹下的非`.java`文件的，我们可以通过修改maven的pom.xml文件来实现这一需求。

```xml
 <resource>
            <directory>src/main/java</directory>
            <includes>
                <include>**/*.fxml</include>
            </includes>
            <!-- 是否替换资源中的属性-->
            <filtering>false</filtering>
</resource>
```

这种写法是将源码文件夹java也作为一个资源文件夹，但是一旦这样定义，原来的resource文件夹就不会作为资源文件夹，所以我们需要把它也加到pom文件中，如下：

```xml
<resource>

                <directory>src/main/resource</directory>
                <includes>
                    <include>**/*.png</include>
                    <include>**/*.json</include>
                    <include>**/*.txt</include>
                    <include>**/*.jpg</include>
                    <include>**/*.icon</include>
                    <include>**/*.js</include>
                    <include>**/*.fxml</include>
                    <include>**/*.css</include>
                    <include>*.css</include>
                    <include>**/*.html</include>
                    <include>src/chart.js/**</include>
                    <include>echarts.min.js</include>
                    <include>echarts.js</include>
                    <include>charts/**</include>
                    <include>needed/*</include>
                </includes>
</resource>
```



还有一个问题，在手动指定资源文件夹后，maven就不会帮我们管理这些资源了，所以我们需要手动指定资源文件夹中需要编译的文件的类型，添加`include`标签即可。

## html资源文件的引用

在html文件中引用外部js文件时，一般采用`script`标签，而在项目中这种引用方式不但不支持`../`，连`/目录名/**`都不支持。。。

> 其实这两种方式在ide中调试的时候都是支持的，然而打包之后各种混乱。吾辈采用的打包方式是将所有文件全部打包进一个jar包中。

此处的问题到现在依然没有一个好的解决方案，其中一种方案是，将需要用的js文件上传到cdn，通过http引用，但考虑到网络条件，我们项目最后采用了，，很傻的一种方法。。以下方法不要借鉴。。。

> 因为项目只引用一个js文件，而且这个js文件也不是很大，所以为了避免出现父级目录访问，我们在每个html文件的文件夹下都拷贝了一份js文件，这样，引用的时候就可以直接：

```javascript
<script src='custom.js'></script>
```
