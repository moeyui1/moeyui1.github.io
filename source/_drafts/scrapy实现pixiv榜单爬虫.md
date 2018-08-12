---
abbrlink: '0'
---
# 前言

最近匀了点时间学后端开发，觉得后端各种各样的框架虽然大大简化了开发流程，但是使得项目变得很“**重**”。同时感受到java web开发确实是一个大工程，做起来很累，很多东西也很难吃得透。

因为做得太累，感觉已经违背了自己的初衷，

> 做一个轻松、有趣的项目

于是偷闲学了一下爬虫。

事先声明一下本程序参考了……的代码，本来是想fork过来改的，结果发现原来的代码已经不适应现在pixiv的登录机制，并且随着开发的进行，改动很多，已经基本见不到原作的影子（除了item类的定义），所以就独立了。

# 开发前的准备

## 环境和依赖

> 1. python2.7
> 2. scrapy1.1
> 3. IDE:pycharm​



## 为什么选择scrapy

爬虫本身其实是一个很简单的东西，写python爬虫没必要要框架，你也可以借助urllib2这样的库来写。

但是吾辈不是为了用爬虫而写爬虫，而是为了更好地了解一个高效、可靠的爬虫如何实现，scrapy毫无疑问是我们的榜样。

## 需求分析

前面说了爬虫很简单，说的是一个最基本的爬虫，即给一个链接，获取http response的内容。但是我们这次的目标可不是那么简单啊。获取[pixiv的榜单](http://www.pixiv.net/ranking.php?mode=daily)，粗略可以分解为以下几个步骤：

> 1. 登录pixiv，不登录是获取不到原图的
> 2. 跳转到榜单界面，获取作品信息
> 3. 跳转到对应的作品界面获取原图地址
> 4. 根据获取到的原图地址下载图片

# 开工吧

好了现在我们可以开工了，下面的内容我会挑一些重点来讲讲，细节部分代码应该写得很清楚。

## 1. 登录验证

首先我们要知道pixiv是如何判断用户是否登录的，我们打开登录界面和浏览器的开发人员工具，然后尝试[在这里](https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page)登录一下，看到network选项卡中的请求，其中有一个post请求，我们看看post了哪些数据。

![post数据](http://7xsf5m.com1.z0.glb.clouddn.com/P%E7%AB%99%E6%A6%9C%E5%8D%95%E7%88%AC%E8%99%AB/post%E6%95%B0%E6%8D%AE.png)

### 1. 校验key

其中id和password很明显，source应该是用来识别设备的，那么这个post_key是做什么用的？我们反复模拟登录多几次，会发现这个key每次都不一样，我们切换到源代码界面，搜索一下这个key的值，发现原来它是每一次都由服务端生成并写在登录form来校验登录的。这其实就是一种简单的反爬虫机制，这里我们可以通过提取出页面中的key填写到我们的post参数中。

> 提取html中的内容的方法很多，实在不能一一举例。目前吾辈学过比较有代表性有以下几种：
>
> 1. **pyquery**
>
>    使用与**jquery**相同的选择逻辑，对前端程序员很友好哦，需要`import pyquery`
>
> 2. **xpath**
>
>    一种html文件索引的规范，很多库都自带了xpath的实现，比如**scrapy**和**pyspider**
>
> 3. **css选择器**
>
>    采用和css选择器相同的选择逻辑，即和pyquery一样对前端友好，又和xpath一样有很多现成的实现

scrapy提供了**xpath**和**css**的实现，这里我以**xpath**为例：

```python
key = response.xpath('//*[@id="old-login"]/form/input[@name="post_key"]/@value').extract()

```

### 2. cookies的处理

登录成功之后我们收到一个302跳转，



被带到pixiv的主页。至于登录失败的处理我们待会儿再说，先处理一下cookies。

有一点后端知识的人应该都知道保存用户的登录状态一般使用cookies，所以我们之后的请求只要请求头中带有对应的cookies信息就可以了。这里scrapy其实已经帮我们自动处理了，所以我们不用担心。

但如果你用的是pyspider，或者你是用urllib2来写的爬虫，就只能自己动手了。解决的思路就是获取登录成功的响应头中的`set-cookies`中的键值，将它们编码到请求头中的`cookies`中去。实际实现的时候其实没有那么麻烦。pyspider提供一个`cookiesjar`类，专门用来存放cookies相关信息。而urllib2似乎只能自己动手，但是在**urllib3**中我们只要获取一个session，就能共享cookies信息，所以基于它的**requests**也可以共享cookies信息。

### 3. 登录失败的处理

这里需要提一下登录失败的处理，我们可以尝试输入错误的密码模拟登录失败，可以看到失败之后并没有收到302跳转，所以可以依据状态码302来判断。虽然是这么想的，然而scrapy中已经自动帮我们处理了302跳转，即我们登录请求收到的response不是302，而是302跳转到的请求的response。*这里说得有点绕了，原谅我语文那么差，简而言之就是我们收到的response.status会一直是200，永远收不到302，因为scrapy已经自动帮我们处理了302。*

> 这就是高层封装，即框架的特点，为了方便将很多东西自动化处理。在比较底层的实现如urllib2中是不会自动对302进行跳转的。此处问题还有一个难点，即scrapy不像**requests**一样可以查询到一个请求被跳转的记录。

其实我们可以通过向`FormRequest`这个方法传递参数来修改对302的处理，这里关于scrapy对各种状态码的处理就不再深究，直接上代码：

```python
# 登录请求
yield scrapy.FormRequest(url='https://accounts.pixiv.net/login?lang=zh', formdata={
            'pixiv_id': setting['PIXIV_USER_NAME'],
            'password': setting['PIXIV_USER_PASS'],
            'post_key': key,
            'source': 'pc'
        }, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.101 Safari/537.36'
        },
                                 meta={
                                     'dont_redirect': True,
                                     'handle_httpstatus_list': [302]
                                 },
                                 callback=self.after_logged_in)

```



这样我们就可以收到302状态码了。至此，登录总算处理完了。

## 2. 获取作品信息

scrapy中有一个先进概念——item，即把爬取到的信息保存为一个一个的item类，这需要实现定义item类的各项属性。然后在这些item类生成时，我们可以使用scrapy的**pipelines**对item进行处理，这确是值得学习的一种处理思想。

此处处理pixiv榜单有一个小技巧，我们在get请求后加一个参数`format=json`可以看到榜单作品会以json文件的形式返回，这就省去了提取html中有效信息的过程。

这里需要提一下的是写爬虫的一个重要思想——**异步**。如果你的处理思路是拿到根据榜单中的图片地址一个一个地去访问图片地址，那就太慢了，而且一旦有一个请求超时，就会严重影响整个爬取。

scrapy就提供了一个很好的异步实现，我们利用`callback`这个方法告诉scrapy一个请求结束之后应该调用什么方法，利用python的`yield`生成大量的请求，这些请求的进行相互独立，使得爬虫更加高效。*这里对于异步不做过多讨论，有兴趣的同学自行谷歌吧。*

## 3. 图片下载

### 1. 无损图片

图片下载可以直接用scrapy中的ImagesPipeline，虽然很方便，然而这种方式下载下来的图片经过了压缩！！经过对源码的分析发现scrapy通过**pillow**对下载到的图片进行了处理，而Pillow的处理是将所有图片一律转换为jpg而且色域统统转换为通用RGB（*这里对色域不是很懂，只好这样表达*）。查了一下scrapy文档，关于ImagePipeline的说明就是为了将图片存储为通用的格式，这么一说无可厚非，但是对于我们来说不能接受啊。。

这里我采用了scrapy的FilesPipeline，实际上ImagePipeline就是它的一个子类，我们直接用FilePipeline处理绕过Pillow就好了，只是写起来相对麻烦一些。

### 2. 非法字符

吾辈的设计是将图片文件名保存为“作者名_作品名”的形式，然而发现有些作者名、作品名内带有非法字符，所以保存时会失败，在此整理了一个非法字符表：

```pyth
invalidChar = ('"', '?', "\\", "/", "<", '>', '|', ':', '*')

```



# 后记

