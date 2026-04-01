---
title: 初探 Kotlin 给 android 代码风格带来的改变
tags:
  - android
  - kotlin
category: 开发
description: >-
  Kotlin 自2016年2月发布第一个官方稳定版以来，一直受到 Java 开发者的密切关注。而就在最近，Google 在2017年5月的 Google
  I/O 上正式宣布将 Kotlin 作为 android 开发的官方语言。
abbrlink: 17b5d45a
pubDate: 2017-05-28 00:00:00
---

Kotlin 是由 JetBrains 推出的用于现代多平台应用的静态编程语言。它与 Scala 和 Java 一样可以运行在 JVM 上，但 Kotlin 与 Scala 不同之处在于它能与 Java 无缝互操作。JetBrains 声称 Kotlin 甚至可以和 Java 互相调用彼此的 `.class` 文件，以至于 Kotlin 可以完美融于现有的 Java 项目中。

Kotlin 自2016年2月发布第一个官方稳定版以来，一直受到 Java 开发者的密切关注。而就在最近，Google 在2017年5月的 Google I/O 上正式宣布将 Kotlin 作为 android 开发的官方语言。

本文试从代码风格的角度分析 Kotlin 给 Android 开发带来的改变。

# 启用 Kotlin 支持

目前 Android Studio 正式版还没有加入对 Kotlin 的支持[^1]，故我们需要手动安装 Kotlin 插件。

在 Settings-> Plugins 中搜索 "Kotlin" 安装，之后重启 AS。

然后在项目中，Tools-> Kotlin-> Configure Kotlin in Project 配置 gradle 中的依赖。

最后在已有代码中使用快捷键 `Ctrl+Alt+Shift+K`，就可以将已有代码转换成 Kotlin 了。这里用到了 JetBrains 提供的 Java 代码自动转换为 Kotlin 代码的功能，需要注意的是此过程是不可逆的，如果需要转换回 Java，只能手动重新修改代码。

# Kotlin 带来的改变

Kotlin 有很多新一代高级语言的特性，接下来我们以 AS 中内置的 LoginActivity 分析 Kotlin 与 Java 的不同。

# 1.  静态成员

```kotlin
companion object {

  private val REQUEST_READ_CONTACTS = 0

  private val DUMMY_CREDENTIALS = arrayOf("foo@example.com:hello", "bar@example.com:world")
}
```



项目中的静态变量不能直接声明为类本身的静态变量。

Kotlin 中类可以声明一个内置对象，以 `object`关键字注明，就像变量声明一样，它可以通过类实例来引用。

而通过给 object 加上 `companion`关键字，可以声明一个伴生对象，这个伴生对象的成员变量和成员方法可以直接通过类名来引用。Kotlin 以此来实现单例模式。

```kotlin
class MyClass {
    companion object {
        fun create(): MyClass = MyClass()
    }
}
val instance = MyClass.create()
```

这样是不是很像 Java 中的静态成员呢？但 Kotlin 官方文档提到

> Note that, even though the members of companion objects look like static members in other languages, at runtime those are still instance members of real objects

且他们还提到

> However, on the JVM you can have members of companion objects generated as real static methods and fields, if you use the `@JvmStatic` annotation.

即 Kotlin 原生并不提供静态成员的实现，它通过伴生对象来提供近似静态成员的功能。是的，Kotlin 的类中没有静态成员。它提倡将静态成员写成一个包级变量或函数，与 Java 不同，Kotlin 的每个文件不一定包含一个 public class，它可以只是一些代码片段。

# 2. Kotlin 与 NPE(NullPointerException)

在使用 Java 编写代码时最为头疼的问题就是NPE，造成NPE的原因有很多，它往往让开发人员摸不着头脑。Kotlin 为了从代码中消除NPE，对语言的类型系统做了很多改善，以达到将NPE可能的原因限制如下：

- 显式调用 `throw NullPointerException()`
- 使用了 `!!` 操作符
- 外部 Java 代码导致的
- 对于初始化，有一些数据不一致（如一个未初始化的 `this` 用于构造函数的某个地方）

在 Android 开发中，Activity 需要获取UI中的组件，在 Kotlin 中是这样声明的：

```kotlin
// UI references.
private var mEmailView: AutoCompleteTextView? = null
...
mEmailView = findViewById(R.id.email) as AutoCompleteTextView
```

注意到类型后面跟了一个`?`，这表示该变量可能为null。相反如果后面没有`?`，则表示该变量一定不为null。

之后的代码如果需要使用该变量，则

```kotlin
    mEmailView?.setAdapter(adapter)
```

试想如果用 Java 编写，`mEmailView`这个变量如果为 null 则这里就会直接 NPE。而 Kotlin 中 `?.`表示当 `mEmailView`为 null 时，该调用返回 null ，且不会执行`setAdapter()`这个方法，避免了NPE。

> 需要注意的是 JetBrains 的 Java 自动转 Kotlin 工具中为了保持程序运行结果一致，默认没有转换`.`为`?.`，而是转换为了`!!.`，此时如果`mEmailView`为 null ，会产生NPE。

通过对类型加上许多限定，Kotlin 基本解决了 Java 的NPE问题，仅仅通过这一点已经可以肯定它的先进性。

# 3. Lamda 与高阶函数

Java 在 1.8 加入了对 Lamda 表达式的支持，但其远远没有在 JavaScript、Python等语言中这么易用。

Kotlin 则提供了较好的支持和实现，我们可以对比一段代码：

```java
private static final String[] DUMMY_CREDENTIALS = new String[]{
  "foo@example.com:hello", "bar@example.com:world"
};
for (String credential : DUMMY_CREDENTIALS) {
  String[] pieces = credential.split(":");
  if (pieces[0].equals(mEmail)) {
    // Account exists, return true if the password matches.
    return pieces[1].equals(mPassword);
  }
}
return true;
```

该代码主要逻辑就是查询登录信息是否与默认账户匹配。而 Kotlin 可以这么写：

```kotlin
private val DUMMY_CREDENTIALS = arrayOf("foo@example.com:hello", "bar@example.com:world")

return DUMMY_CREDENTIALS
.map { credential -> credential.split(":".toRegex()).dropLastWhile({ it.isEmpty() }).toTypedArray() }
.firstOrNull { it[0] == mEmail }
?.let {
  // Account exists, return true if the password matches.
  it[1] == mPassword
}
?: true
```

其中先使用`map()`方法代替 for 循环遍历生成分割字符串后的数组，然后使用`firstOrNull()`寻找 email 匹配项，最后使用了`.?let{}`的调用形式，表示如果找到匹配项，则执行 let 后的代码块，判断密码是否相等；如果找不到，该表达式为 null ，则返回 true。

> 代码中表达式值及 `?:`操作符将在下一部分介绍

这段代码体现了函数式编程的风格，成功地使函数式编程在 Android 开发中更加易用。

# 4. 糖分

上面的代码对比中，出现了很多 Kotlin 的独有特性。现在，程序语言正逐渐朝着接近自然语言的方向发展，其主要目的是为了让代码更好写、更好读。

举个例子，从 Java6 开始，你可以直接只用`+`拼接字符串而不用担心带来的性能损失，因为 Java 会在编译时帮你替换为 StringBuilder 的构建方式。这使得字符串拼接的代码编写更简单方便了，但没有影响语言的功能。我们称之为[语法糖（Syntactic sugar）](http://baike.baidu.com/item/%E8%AF%AD%E6%B3%95%E7%B3%96)。

语言含糖量高可以大大提高开发人员的效率，这也是近代需要高级语言的特征。

Kotlin 就是一个含糖量很高的语言，在上面的代码中，return 直接返回了`?:`操作的结果，其中`?:`表示如果`?:`前的表达式为 null 则返回`?:`后的值。而 `.?let{}`操作在操作数为 null 时也会返回 null。

此时我们注意到 Kotlin 中其实很多操作都是带返回值的，比如 if 操作：

```kotlin
val a= 0
val b= 0
val c= if(a>b)a else b	// if 返回较大值
```

上面的代码中还有这么一句：

```kotlin
private val DUMMY_CREDENTIALS = arrayOf("foo@example.com:hello", "bar@example.com:world")
```

`arrayOf()`可以用于快速构建数组。在构建数组上这种方式相比 Java 的构建方式优势不是很明显，那如果我告诉你 Kotlin 还提供了 `mapOf()`、`listOf()`呢？Java 原有的语法中新建一个 list并添加几个值比较麻烦，需要重复调用 `add(T t)`方法，而 Kotlin 就提供了类似与数组初始化的简便方法。

# 总结

Kotlin 相对 Java 的改进真的很多，诸如受检异常、when 表达式等，相信它也将为 Android 开发注入新的活力。本文仅通过一小段代码分析，未免管中窥豹，Kotlin 所代表的新一代程序语言的思想也值得所有 Java 开发者学习。

Google 此次大力推行 Kotlin ，也许是考虑到与 Oracle 的版权纠纷，所以 Kotlin 今后在 Android 开发的发展还是值得期待的。

[^1]: AS 的3.0（preview）版本中已经内置了 Kotlin 插件