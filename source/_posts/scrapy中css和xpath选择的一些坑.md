---
title: scrapy中css和xpath选择的一些坑
description: scrapy中xpath和css提取节点中子节点文本的一些坑
tags:
  - scrapy
  - 爬虫
  - python
abbrlink: 35b1ad9c
date: 2016-09-19 10:50:48
---

## 问题背景

最近观摩一个[新浪微博爬虫](https://github.com/LiuXingMing/SinaSpider)项目时，发现该项目中对微博内容的提取有点问题，具体表现在提取诸如以下的html代码时，

```html
<span class="ctt">:无组织排放？[吃惊]分享<a href="http://weibo.cn/pages/100808topic?extparam=%E8%94%9A%E8%93%9D%E5%9C%B0%E5%9B%BE&amp;from=feed">#蔚蓝地图#</a>上一张图片，2016年09月15日12点。 <br><a href="http://weibo.cn/sinaurl?f=w&amp;u=http%3A%2F%2Ft.cn%2FRcXZofm&amp;ep=E8mVR5zcW%2C2174951252%2CE8mVR5zcW%2C2174951252">http://t.cn/RcXZofm</a></span>
```

提取结果为：

> :无组织排放？[吃惊]分享

后面的文字都丢失了。看一下代码，

```py
content = tweet.xpath('div/span[@class="ctt"]/text()').extract_first()  # 微博内容
```

使用了xpath选择器，语法应该没有错，确实能选到`span`节点。但是问题在于节点的text属性遇到子节点的时候就中断了。

## 换用css选择器

会不会是受限于xpath的语法？吾辈自行在shell中实验了一下，

```python
from scrapy.selector import Selector
sel = Selector(text='<a href="#" class="hhh">Click here to go to the <strong>Next Page</strong></a>')
print sel.css('.hhh::text').extract()
```

好吧其实就是拿[scrapy文档中的例子](http://doc.scrapy.org/en/latest/topics/selectors.html#some-xpath-tips)改了一下。输出是

```
[u'Click here to go to the ']
```

结果是一样的。

## 解决方案

### xpath解决方案

查阅了一下scrapy的文档，发现[其中提到了这样的情况](http://doc.scrapy.org/en/latest/topics/selectors.html#using-text-nodes-in-a-condition)，解决方案是改成这么写：

```python
content = tweet.xpath('string(div/span[@class="ctt"])').extract_first()  # 微博内容
```

就是用一个`string()`将节点内容转换为字符串，并且子节点内容也被转换为string。官方文档是这么解释的：

> A *node* converted to a string, however, puts together the text of itself plus of all its descendants.
>



### css解决方案

然而官方并没有给出css选择器的解决方案ヽ(°◇° )ノ...

感觉官方文档似乎偏向于用xpath解决问题●︿●

其实通过上面的xpath的解决可以看出来，原代码的选择错在只选择了父节点，所有没有处理子节点，那么只要用css选择所有子节点就好啦=￣ω￣=

以上文css选择器的例子来说明，目标html代码为：

```html
<a href="#" class="hhh">Click here to go to the <strong>Next Page</strong></a>
```

那么

```python
from scrapy.selector import Selector
sel = Selector(text='<a href="#" class="hhh">Click here to go to the <strong>Next Page</strong></a>')
print sel.css('.hhh *::text').extract()
```

就好了。输出是

```shel
[u'Click here to go to the ', u'Next Page']
```

注意这是个数组！！不同于xpath的`string()`递归处理子节点，css选择器返回的是一个list，调用`extract()`自然返回的是每个子节点`extract()`的结果数组。所以之后只要拼接一下就好啦o(￣▽￣)d

---

## 9月27日更新
### 参考lxml.etree文档
scrapy中的xpath选择器的实现其实就是基于`lxml.etree`，而etree文档中提到了这样一个例子：
```html
<html><body>TEXT<br/>TAIL</body></html>
```
对上述文档进行如下操作：
```python
>>> print(html.xpath("string()")) # lxml.etree only!
TEXTTAIL
>>> print(html.xpath("//text()")) # lxml.etree only!
['TEXT', 'TAIL']
```
原来`string()`方法是在这里实现的ヽ(°◇° )ノ