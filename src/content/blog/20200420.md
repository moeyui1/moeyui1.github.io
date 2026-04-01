---
title: Go 开发经验总结
tags:
  - Go
category: 开发
description: 最近使用 Go 开发了一个新服务，第一次使用 Go 进行企业级服务开发，特总结经验如下。
abbrlink: a1eba719
pubDate: 2020-04-20 22:55:01
---

## 1.简介

Go语言有时候被描述为“C类似语言”，或者是“21世纪的C语言”。Go 从 C 语言继承了相似的表达式语法、控制流结构、基础数据类型、调用参数传值、指针等很多思想，还有C语言一直所看中的编译后机器码的运行效率以及和现有操作系统的无缝适配。

Go 虽然拥有自动垃圾回收、一等函数、词法作用域、系统调用接口等非常棒的特性，但其本身的特性并不多，并且也不太可能添加太多的特性。例如，Go 没有隐式的数值转换，没有构造函数和析构函数，没有运算符重载，没有默认参数，也没有继承，没有泛型，没有异常，没有宏，没有函数修饰，更没有线程局部存储。因为 Go 语言倡导成熟和稳定，并且保证向后兼容。

## 2.基础

### 2.1 Hello, World

编写文件 `helloworld.go`

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, 世界")
}
```

Go 是一门编译型语言，Go 语言的工具链将源代码及其依赖转换成计算机的机器指令。Go 语言提供的工具都通过一个单独的命令 `go` 调用，`go` 命令有一系列子命令。最简单的一个子命令就是 `run`。这个命令编译一个或多个以 ` .go` 结尾的源文件，链接库文件，并运行最终生成的可执行文件。所以上面的程序也可以通过 `go run helloworld.go` 来运行。当然，也可以通过 `go build helloworld.go` 来编译，生成一个可执行二进制文件。

### 2.2 代码格式

Go 对于代码格式要求很严格，它提供 `gofmt` 工具把代码格式化为标准格式（Go 官方认定的一套代码格式），主流的 IDE 在保存 Go 源码时都会自动应用 `gofmt`，这使得 Go 源码的格式非常统一，Go 开发者不会为代码格式而烦恼。如果格式不对，编译时会报错。

> 以法令方式规定标准的代码格式可以避免无尽的无意义的琐碎争执。

更重要的是，由于 Go 源码格式是唯一确定的，这使得开发者可以基于唯一格式做各种自动源码处理。

### 2.3 命名风格

#### 2.3.1 可见性

在 Go 语言中，名字开头字母的大小写决定了其在包外的可见性。如果一个名字是大写字母开头的，那么它将导出供包外访问。如：

```go
type(
  People struct {
    Name string	// 名称在前，类型在后
    age  int
  }
  house struct {
    name string
  }
)
```

包名则习惯总是用小写字母。

#### 2.3.2 长度

名字的长度没有逻辑限制，但 Go 语言风格倡导使用短小的命名，尤其对于局部变量而言。在 Go 源码中会经常出现 i, p 之类的短名字，只有当那些名字作用域较大，生命周期较长的变量才会使用有意义的长命名。

### 2.4 声明和变量

可以使用 `var` 关键字来声明一个特定类型的变量，如下

```go
// 标准
var num int = 10
// 省略初始化
var name string
// 省略类型，自动推断
var age = 1
```

#### 2.4.1 零值初始化机制

与 Java 语言不同，如果初始化表达式被省略，那么将使用零值初始化该变量。

+ 数值类型：0
+ 布尔类型： false
+ 字符串：""（空字符串）
+ 接口或引用类型：nil

零值初始化机制可以确保每个声明的变量总是有一个良好定义的值，因此 Go 语言中不存在未初始化的变量。

#### 2.4.2 简短变量声明

在函数内部，有一种成为简短变量声明语句的形式可用于声明和初始化局部变量。

```go
t := 0.1
a, b := "a", 100
```

因为简洁和灵活的特点，简短变量声明被广泛用于大部分的局部变量的声明和初始化。`var` 形式的声明语句往往是用于需要显式指定变量类型地方，或者因为变量稍后会被重新赋值而初始值无关紧要的地方。

对于已经声明过的变量，简短变量声明语句的行为变为赋值。

```go
in, e := 1, 2
// ...
out, err := 2, 3
```

### 2.5 指针

是的，Go 语言中有指针。

#### 2.5.1 值拷贝

与 Java 语言不同，Go 中的函数入参、返回值都是值拷贝而非引用传递。所以，尽管 Go 的日常开发中较少需要使用指针，但参数值拷贝代价较大时，应当考虑使用指针。

```go
// https://play.golang.org/p/JgAMeQjXcfV
package main

import (
	"fmt"
)

type people struct {
	name string
}

func rename(p people, name string) {
	p.name = name
}

func main() {
	var p1 = people{"myk"}
	fmt.Println(p1.name)
	rename(p1, "MYK")
	fmt.Println(p1.name)
}
```

输出是：

```
myk
myk
```

#### 2.5.2 示例：命令参数

指针是实现标准库中 flag 包的关键技术，它使用命令行参数来设置对应变量的值。

```go
// Echo4 prints its command-line arguments.
package main
import (
  "flag"
  "fmt"
  "strings"
)
// 返回指针
var n = flag.Bool("n", false, "omit trailing newline")
func main() {
  // 解析命令行参数
  flag.Parse()
  fmt.Print(flag.Args())
  if !*n {
  	fmt.Println()
  }
}
```

调用 `flag.Bool` 函数会创建一个新的对应布尔型标志参数的变量。它有三个属性：第一个是的命令行标志参数的名字`n`，然后是该标志参数的默认值（这里是 false），最后是该标志参数对应的描述信息。上面的 `n` 是对应命令行标志参数变量的指针。

### 2.6 多返回值

在 Go 语言中，一个函数可以返回多个值。通常，Go 函数会返回两个值，一个是期望的返回值，另一个是函数出错时的错误信息。

```go
func divide(a int, b int)(int, error){
  if (b == 0){
    return 0, errors.New("xxxxx")
  }else {
    return a/b, nil
  }
}

r, err := divide(3, 1)
if err != nil {
  // 错误处理
}
```

### 2.7 Deferred 函数

在网络、IO 操作时，总要记得关闭资源。在 Java 中可以通过 try finally 块或 try with resources 来保证。而 Go 中可以通过独特的 defer 关键字实现。defer 语句执行时，会将其后面的函数延迟执行。直到包含该 defer 语句的函数执行完毕时，这个函数才会被执行。可以在一个函数中执行多条 defer 语句，它们的执行顺序与声明顺序相反。

```go
func do(){
	f, _ := os.Create("/tmp/tmp.txt")
	defer f.Complete()
  // do something
  f.Write(...)
}
```

## 3.数组和切片

### 3.1 数组

数组是一个由固定长度的特定类型元素组成的序列，一个数组可以由零个或多个元素组成。因为数组的长度是固定的，因此在 Go 语言中很少直接使用数组。和数组对应的类型是Slice（切片），它是可以增长和收缩的动态序列，slice 功能也更灵活，但是要理解 slice工作原理的话需要先理解数组。

初始化数组：

```go
a := [...]int{1, 2}
```

初始化数组的索引顺序并不重要，可以如下初始：

```go
type Currency int
const (
    USD Currency = iota // 美元
    EUR                 // 欧元
    GBP                 // 英镑
    RMB                 // 人民币
)

symbol := [...]string{USD: "$", EUR: "€", GBP: "￡", RMB: "￥"}

fmt.Println(RMB, symbol[RMB]) // "3 ￥"
```

也可以这样：

```go
r := [...]int{99:-1}
```

未被初始化的元素都是零值。

由于 Go 的入参是值拷贝，所以传递大数组非常低效，并且函数内无法修改原数组。故时常显式地传入一个数组指针：

```go
// 用于清空数组
func zero(ptr *[32]byte) {
    for i := range ptr {
        ptr[i] = 0
    }
}
```

### 3.1 切片

Go 语言中数组长度也是类型的一部分，即 `[32]byte` 与 `[16]byte`是不同的类型，也就是说，上面这个函数不能接收 `*[16]byte` 类型的参数。同时，没有任何方法能添加或删除数组中的元素，所以数组使用起来并不便利。在实际开发中，一般使用 slice 来替代数组。

Slice（切片）代表变长的序列，序列中每个元素都有相同的类型。一个 slice 类型一般写作 `[]T`，其中T代表 slice 中元素的类型；slice 的语法和数组很像，只是没有固定长度而已。

```go
s := []int{1, 2}
```

数组和 slice 之间有着紧密的联系。一个 slice 是一个轻量级的数据结构，提供了访问数组子序列（或者全部）元素的功能，而且 slice 的底层确实引用一个数组对象。一个 slice 由三个部分构成：指针、长度和容量。指针指向第一个 slice 元素对应的底层数组元素的地址，要注意的是 slice 的第一个元素并不一定就是数组的第一个元素。长度对应 slice 中元素的数目；长度不能超过容量，容量一般是从 slice 的开始位置到底层数据的结尾位置。内置的 `len` 和 `cap` 函数分别返回 slice 的长度和容量。

多个slice之间可以共享底层的数据，并且引用的数组部分区间可能重叠。

#### 3.1.1 示例

声明一个月份数组如：

```go
months := [...]string{1: "January", /* ... */, 12: "December"}
```

使用切片操作：

```go
Q2 := months[4:7]
summer := months[6:9]
fmt.Println(Q2)     // ["April" "May" "June"]
fmt.Println(summer) // ["June" "July" "August"]
```

![img](https://box.kancloud.cn/2016-01-10_5691fbe34a76f.png)

如果切片操作超出 `cap(s)` 的上限将导致一个 panic 异常，但是超出 `len(s)` 则是意味着扩展了 slice，因为新 slice 的长度会变大：

```go
fmt.Println(summer[:20]) // panic: out of range

endlessSummer := summer[:5] // 扩展切片 (capacity 内)
fmt.Println(endlessSummer)  // "[June July August September October]"
```

因为 slice 值包含指向第一个 slice 元素的指针，因此向函数传递 slice 将允许在函数内部修改底层数组的元素。换句话说，复制一个 slice 只是对底层的数组创建了一个新的 slice 别名。

#### 3.1.2 append

当 len<cap 时，append 会在底层数组的基础上直接扩展切片；而 len=cap 时，append 后的切片长度会超出底层数组，这时一个新数组将被创建，返回的切片的底层数组将与原切片不同。所以，一般不能确认 append 返回的切片是否与原切片使用同样的底层数组，故通常将返回值复制给原切片。

```go
endlessSummer = append(endlessSummer, "No", "De", "??")
```

## 4.Goroutines 和 Channel

Go 语言中的并发程序可以用两种手段实现，本节主要介绍 goroutines 和 channel。

### 4.1 Goroutines（协程）

Go 协程可以看作是轻量级线程。与线程相比，创建一个 Go 协程的成本很小。因此在 Go 应用中，常常会看到有数以千计的 Go 协程并发地运行。

> A *goroutine* is a lightweight thread managed by the Go runtime.

#### 4.1.1 协程

进程拥有代码和打开的文件资源、数据资源、独立的内存空间。

线程从属于进程，是程序的实际执行者。一个进程至少包含一个主线程，也可以有更多的子线程。线程拥有自己的栈空间。

![img](https://pic2.zhimg.com/80/v2-ae1d48089f6a4ff589bb5b948ee74a8d_1440w.jpg)

**对操作系统来说，线程是最小的执行单元，进程是最小的资源管理单元。**

**协程，英文 Coroutines，是一种比线程更加轻量级的存在。**正如一个进程可以拥有多个线程一样，一个线程也可以拥有多个协程。

![img](https://pic4.zhimg.com/80/v2-a31ca547de92311f644a4d25566eca1f_1440w.jpg)

最重要的是，协程不是被操作系统内核所管理，而完全是由程序所控制（也就是在用户态执行）。

这样带来的好处就是性能得到了很大的提升，不会像线程切换那样消耗资源。

#### 4.1.2 Go 协程内部原理

综上可知，Go 协程实际上是由 Go 运行时管理的轻量级线程。Go 运行时中有一个专用的协程调度器 Go scheduler，更多可以参考 https://www.zhihu.com/question/20862617.

Go 使用独立的调度器其中一个原因是 Go 的垃圾回收需要等待所有的 goroutine 停止，使得内存状态一致。而垃圾回收的时间点是不确定的，如果依赖操作系统的调度器，那么需要等待大量线程。

goroutines 在使用上非常简单，使用关键字 `go` 即可启动协程。例如：

```go
// https://play.golang.org/p/ZgRpYwet59D
package main

import (
	"fmt"
)

func main() {
	go say("Hello World")
}

func say(s string) {
	fmt.Println(s)
}
```

这个例子其实有些问题，实际运行时可能没有输出。我们将在后面 WaitGroup 的章节中完善它。

##### 4.1.2.1 调度模型简介

Goroutines 能拥有强大的并发实现是通过 GPM 调度模型实现，下面就来解释下 goroutines的调度模型。

![img](https://images2018.cnblogs.com/blog/1075473/201807/1075473-20180704144900055-654632620.jpg)

Go 的调度器内部有四个重要的结构：M，P，S，Sched，如上图所示（Sched未给出）

+ M：M 代表内核级线程，一个 M 就是一个线程，goroutine 就是跑在 M 之上的；M 是一个很大的结构，里面维护小对象内存 cache（mcache）、当前执行的 goroutine、随机数发生器等等非常多的信息；
+ G：代表一个 goroutine，它有自己的栈，instruction pointer 和其他信息（正在等待的 channel 等等），用于调度；
+ P：P 全称是 Processor，处理器，它的主要用途就是用来执行 goroutine 的，所以它也维护了一个 goroutine 队列，里面存储了所有需要它来执行的 goroutine，是调度的上下文；
+ Sched：代表调度器，它维护有存储 M 和 G 的队列以及调度器的一些状态信息等。

##### 4.1.2.2 调度实现

![img](https://images2018.cnblogs.com/blog/1075473/201807/1075473-20180704160300058-287296807.jpg)

从上图中看，有2个物理线程 M，每一个 M 都拥有一个处理器 P，每一个也都有一个正在运行的 goroutine。

P 的数量可以通过设置环境变量 `GOMAXPROCS` 或通过运行时函数 `GOMAXPROCS()` 来设置，它其实也就代表了真正的并发度，即有多少个goroutine 可以同时运行。

图中灰色的那些 goroutine 并没有运行，而是处于 ready 的就绪态，它们被排列在名为 runqueues 的列表中。P 维护着这个队列（称之为 runqueue），每有一个 go 语句被执行，runqueue 队列就在其末尾加入一个。

为了减少互斥锁的竞争，每个 P 都有自己的本地运行队列。旧版本的 Go 调度程序只有一个全局运行队列，该队列由互斥体保护。线程通常在等待互斥锁解除锁定时被阻塞，性能并不好。

为什么需要 P（上下文）？为什么不能直接把运行队列放到线程上，去掉上下文？因为如果正在运行的线程由于某种原因（常常是系统调用）需要阻塞，那么我们可以将上下文交给其它线程。

当一个 OS 线程 M0 陷入阻塞时（如下图)，P 转而在运行 M1，图中的 M1 可能是正被创建，或者从线程缓存中取出。

![img](https://images2018.cnblogs.com/blog/1075473/201807/1075473-20180704162532330-809705926.jpg)

当 M0 返回时，它必须尝试取得一个 P 来运行goroutine，一般情况下，它会从其他的 OS 线程那里“偷”一个 P 过来，如果没有偷到的话，它就把 goroutine 放在一个 global runqueue 里，然后自己睡眠（放入线程缓冲里）。这个 global runqueue 是 P 在用完本地运行队列时从中提取的运行队列。所有的 P 也会周期性的检查 global runqueue 并运行其中的 goroutine，否则 global runqueue 上的 goroutine 永远无法执行。

以上处理系统调用的逻辑就是 Go 即使在 `GOMAXPROCS` 设为1时仍然运行多线程的原因 。

还有一种情况是 P 所分配的任务 G 很快就执行完了（分配不均），这就导致了这个处理器 P 很闲，但是其他的 P 还有任务，此时如果 global runqueue 没有任务 G 了，那么 P 不得不从其他的 P 里拿一些 G 来执行。一般来说，如果 P 从其他的 P 那里要拿任务的话，一般就拿 runqueue 的一半，这就确保了每个 OS 线程都能充分的使用，如下图：

![img](https://images2018.cnblogs.com/blog/1075473/201807/1075473-20180704164251684-1689850867.jpg)

#### 4.1.3 WaitGroup

前面提到的例子实际运行时可能会没有输出，这是因为协程执行前，主线程可能已经结束了。

Go sync 包下提供了 `sync.WaitGroup`，可以解决上述问题。修改程序如：

```go
// https://play.golang.org/p/m4DSi2cCxTE
package main

import (
	"fmt"
	"sync"
)

var wg = sync.WaitGroup{}

func main() {
  // 添加一个等待计数
	wg.Add(1)
	go say("Hello World")
  // 阻塞等待
	wg.Wait()
}

func say(s string) {
	fmt.Println(s)
  // 减少一个等待计数
	wg.Done()
}
```

##### 4.1.3.1 实现原理

WaitGroup 的实现使用了信号量，其结构如下：

```go
type WaitGroup struct {
	// 64-bit value: high 32 bits are counter, low 32 bits are waiter count.
	// 64-bit atomic operations require 64-bit alignment, but 32-bit
	// compilers do not ensure it. So we allocate 12 bytes and then use
	// the aligned 8 bytes in them as state, and the other 4 as storage
	// for the sema.
	state1 [3]uint32
}
```

![3d44fe27957013aa82eca2923cafe50d909.jpg](https://oscimg.oschina.net/oscnet/3d44fe27957013aa82eca2923cafe50d909.jpg)

state1 是个长度为3的数组，其中包含了 state 和一个信号量，而 state 实际上是两个计数器：

- counter：当前还未执行结束的 goroutine 计数器
- waiter count：等待 goroutine-group 结束的 goroutine 数量，即有多少个等候者
- semaphore：信号量 

信号量是Unix系统提供的一种保护共享资源的机制，用于防止多个线程同时访问某个资源。可简单理解为信号量为一个数值：

- 当信号量>0时，表示资源可用，获取信号量时系统自动将信号量减1；
- 当信号量==0时，表示资源暂不可用，获取信号量时，当前线程会进入睡眠，当信号量为正时被唤醒；

WaitGroup对外提供三个接口：

- `Add(delta int)`: 将 delta 值加到 counter 中。当 counter = 0 时根据 waiter 数值释放等量的信号量，把等待的 goroutine 全部唤醒

  ```go
  func (wg *WaitGroup) Add(delta int) {
      statep, semap := wg.state() //获取state和semaphore地址指针
      
      state := atomic.AddUint64(statep, uint64(delta)<<32) //把delta左移32位累加到state，即累加到counter中
      v := int32(state >> 32) //获取counter值
      w := uint32(state)      //获取waiter值
      
      if v < 0 {              //经过累加后counter值变为负值，panic
          panic("sync: negative WaitGroup counter")
      }
  
      //经过累加后，此时，counter >= 0
      //如果counter为正，说明不需要释放信号量，直接退出
      //如果waiter为零，说明没有等待者，也不需要释放信号量，直接退出
      if v > 0 || w == 0 {
          return
      }
  
      //此时，counter一定等于0，而waiter一定大于0（内部维护waiter，不会出现小于0的情况），
      //先把counter置为0，再释放waiter个数的信号量
      *statep = 0
      for ; w != 0; w-- {
          runtime_Semrelease(semap, false) //释放信号量，执行一次释放一个，唤醒一个等待者
      }
  }
  ```

- `Wait()`： waiter 递增1，并阻塞等待信号量 semaphore

  ```go
  func (wg *WaitGroup) Wait() {
      statep, semap := wg.state() //获取state和semaphore地址指针
      for {
          state := atomic.LoadUint64(statep) //获取state值
          v := int32(state >> 32)            //获取counter值
          w := uint32(state)                 //获取waiter值
          if v == 0 {                        //如果counter值为0，说明所有goroutine都退出了，不需要待待，直接返回
              return
          }
          
          // 使用CAS（比较交换算法）累加waiter，累加可能会失败，失败后通过for loop下次重试
          if atomic.CompareAndSwapUint64(statep, state, state+1) {
              runtime_Semacquire(semap) //累加成功后，等待信号量唤醒自己
              return
          }
      }
  }
  ```

- `Done()`： counter 递减1，按照 waiter 数值释放相应次数信号量

  ```go
  func (wg *WaitGroup) Done() {
  	wg.Add(-1)
  }
  ```

### 4.2 Channel

goroutine 本质上是协程，协程之间如何通信呢？

> *Do not communicate by sharing memory; instead, share memory by communicating.*
>
> 不要通过共享内存来通信，要通过通信来共享内存。

Java，C++ 等语言使用的传统线程模型要求开发者在不同线程中通过共享内存通信。通常，共享数据结构通过锁来保护，线程通过争夺锁的方式来访问数据。

而 Go 的并发原语——goroutines 和 channels 提供了一种优雅而独特的方法。Go 鼓励使用 channel 在 goroutine 之间传递对数据的引用，而不是显式地使用锁来调解对共享数据的访问。

#### 4.2.1 使用

每个 channel 都有一个特殊的类型，也就是 channels 可发送数据的类型。一个可以发送int 类型数据的 channel 一般写为 `chan int`。Channel 一般有带缓冲和不带缓冲两种类型：

```go
// buffered
ch := make(chan int, 3)
// unbuffered
ch := make(chan int)
```

一个 channel 有发送和接受两个主要操作，都是通信行为。一个发送语句将一个值从一个 goroutine 通过 channel 发送到另一个执行接收操作的 goroutine。发送和接收两个操作都是用`<-`运算符。在发送语句中，`<-`运算符分割 channel 和要发送的值。在接收语句中，`<-`运算符写在channel对象之前。一个不使用接收结果的接收操作也是合法的。

```go
ch <- x  // a send statement
x = <-ch // a receive expression in an assignment statement
<-ch     // a receive statement; result is discarded
```

Channel 还支持 close 操作，用于关闭 channel，随后对基于该 channel 的任何发送操作都将导致 panic 异常。对一个已经被 close 过的 channel 之行接收操作依然可以接受到之前已经成功发送的数据；如果 channel 中已经没有数据的话讲产生一个零值的数据。

使用内置的 `close` 函数就可以关闭一个 channel：

```go
close(ch)
```

#### 4.2.2 无缓冲 Channels

一个基于无缓冲 Channels 的发送操作将导致发送者 goroutine 阻塞，直到另一个goroutine 在相同的 Channels 上执行接收操作，当发送的值通过 Channels 成功传输之后，两个 goroutine 可以继续执行后面的语句。反之，如果接收操作先发生，那么接收者 goroutine 也将阻塞，直到有另一个 goroutine 在相同的 Channels 上执行发送操作。

基于无缓冲 Channels 的发送和接收操作将导致两个 goroutine 做一次同步操作。因为这个原因，无缓冲 Channels 有时候也被称为同步 Channels。当通过一个无缓冲 Channels 发送数据时，接收者收到数据发生在唤醒发送者 goroutine 之前。*happens before* 是Go语言并发内存模型的一个关键术语。

使用同步 Channels 可以将上面的例子改造如下：

```go
// https://play.golang.org/p/scuDtKvwqGQ
package main

import "fmt"

var ch = make(chan int)

func main() {
	go say("Hello World")
	<-ch
}

func say(s string) {
	fmt.Println(s)
	ch <- 1
}
```

#### 4.2.3 缓冲 Channels

带缓冲的 channel 内部持有一个元素队列。队列的最大容量是在调用make函数创建channel 时通过第二个参数指定的。其底层数据结构如下：

![img](https://img-blog.csdnimg.cn/20190307092857857.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3UwMTA4NTMyNjE=,size_16,color_FFFFFF,t_70)

#### 4.2.4 sends and receives

不同goroutine在channel上面进行读写时，涉及到的过程比较复杂，比如下图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190105122332181.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3UwMTA4NTMyNjE=,size_16,color_FFFFFF,t_70)

上图中G1会往channel里面写入数据，G2会从channel里面读取数据。

G1作用于底层hchan的流程如下图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190105123351626.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3UwMTA4NTMyNjE=,size_16,color_FFFFFF,t_70)

1. 先获取全局锁；
2. 然后enqueue元素(通过移动拷贝的方式)；
3. 释放锁；

G2读取时候作用于底层数据结构流程如下图所示：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190105123802359.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3UwMTA4NTMyNjE=,size_16,color_FFFFFF,t_70)

1. 先获取全局锁；
2. 然后dequeue元素(通过移动拷贝的方式)；
3. 释放锁；

上面的读写思路其实很简单，除了hchan数据结构外，不要通过共享内存去通信；而是通过通信(复制)实现共享内存。

#### 4.2.5 阻塞与调度

当向满 channel 写入数据时，发生了什么呢？

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190105143018955.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3UwMTA4NTMyNjE=,size_16,color_FFFFFF,t_70)

上图流程大概如下：

当前 goroutine（G1）会调用`gopark`函数，将当前协程置为 waiting 状态；
将M和G1绑定关系断开；
scheduler 会调度另外一个就绪态的 goroutine 与 M 建立绑定关系，然后 M 会运行另外一个 G。
所以整个过程中，OS thread会一直处于运行状态，不会因为协程G1的阻塞而阻塞。最后当前的G1的引用会存入 channel 的 sender 队列（队列元素是持有G1的sudog）。

那么 blocked 的G1怎么恢复呢？当有一个 receiver 接收 channel 数据的时候，会恢复 G1。实际上 hchan 数据结构也存储了 channel 的 sender 和 receiver 的等待队列。数据原型如下：

![在这里插入图片描述](https://img-blog.csdnimg.cn/20190307093911177.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3UwMTA4NTMyNjE=,size_16,color_FFFFFF,t_70)

总结一下 Channel 的内部结构如下图：

![img](https://i6448038.github.io/img/channel/hchan.png)

- `buf`是有缓冲的channel所特有的结构，用来存储缓存数据。是个循环链表
- `sendx`和`recvx`用于记录`buf`这个循环链表中的发送或者接收的index
- `lock`是个互斥锁。
- `recvq`和`sendq`分别是接收(<-channel)或者发送(channel <- xxx)的goroutine抽象出来的结构体(sudog)的队列。是个双向链表

### 4.3 Context

上下文 [`context.Context`](https://github.com/golang/go/blob/df2999ef43ea49ce1578137017949c0ee660608a/src/context/context.go#L62-L154) 是用来设置截止日期、同步信号，传递请求相关值的结构体。上下文与 Goroutine 有比较密切的关系。[`context.Context`](https://github.com/golang/go/blob/df2999ef43ea49ce1578137017949c0ee660608a/src/context/context.go#L62-L154) 是 Go 语言中独特的设计，在其他编程语言中我们很少见到类似的概念。

#### 4.3.1 设计原理

在 Go 服务器中，每个传入的请求都在其自己的 goroutine 中处理。请求处理程序通常会启动其他 goroutine 来访问后端，如数据库和 RPC 服务。当请求被取消或超时时，处理该请求的所有 goroutine 都应快速退出，以便系统可以回收它们正在使用的任何资源。

![golang-context-usage](https://tva1.sinaimg.cn/large/00831rSTgy1gd7c035gouj30xc0aa74l.jpg)

如下图，如果最上层的 goroutine 因某些原因失败时，下层的 goroutine 无法感知，将继续工作：

![golang-without-context](https://tva1.sinaimg.cn/large/00831rSTgy1gd7c1p9jmij30xc0aadfz.jpg)

而通过传递 Context，可以让 goroutine 感知整体的状态。Context 代码结构如下：

```go
type Context interface {
	Deadline() (deadline time.Time, ok bool)
	Done() <-chan struct{}
	Err() error
	Value(key interface{}) interface{}
}
```

1. `Deadline`：返回 [`context.Context`](https://github.com/golang/go/blob/df2999ef43ea49ce1578137017949c0ee660608a/src/context/context.go#L62-L154) 被取消的时间，也就是完成工作的截止日期；
2. `Done`：返回一个 Channel，这个 Channel 会在当前工作完成或者上下文被取消之后关闭，多次调用 `Done` 方法会返回同一个 Channel；
3. `Err`：返回 `context.Context` 结束的原因，它只会在 `Done` 返回的 Channel 被关闭时才会返回非空的值；
   1. 如果 [`context.Context`](https://github.com/golang/go/blob/df2999ef43ea49ce1578137017949c0ee660608a/src/context/context.go#L62-L154) 被取消，会返回 `Canceled` 错误；
   2. 如果 [`context.Context`](https://github.com/golang/go/blob/df2999ef43ea49ce1578137017949c0ee660608a/src/context/context.go#L62-L154) 超时，会返回 `DeadlineExceeded` 错误；
4. `Value`：从 [`context.Context`](https://github.com/golang/go/blob/df2999ef43ea49ce1578137017949c0ee660608a/src/context/context.go#L62-L154) 中获取键对应的值，对于同一个上下文来说，多次调用 `Value` 并传入相同的 `Key` 会返回相同的结果，该方法可以用来传递请求特定的数据；

#### 4.3.2 使用

下面的示例演示了如何使用一个带超时的 Context：

```go
// https://play.golang.org/p/WNVVur7OGgV
package main

import (
	"context"
	"fmt"
	"time"
)

func main() {
	// 构造一个超时时间为 1s 的 context
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	go handle(ctx, 500*time.Millisecond)

	<-ctx.Done()
	fmt.Println("main: ", ctx.Err())
}

func handle(ctx context.Context, duration time.Duration) {
  // select 语句可以同时监听多个 Channel
	select {
	case <-ctx.Done():
		fmt.Println("handle", ctx.Err())
    // time.After(durantion) 返回一个同步 Channel
	case <-time.After(duration):
		// 模拟阻塞的耗时操作
		fmt.Println("处理耗时：", duration)
	}
}

```

### 4.4 实践

下面是一段示例代码，其主要逻辑包含两个并行任务：

```go
func (agent *Agent) doSpecialize(ctx context.Context, req *SpecializeRequest) error {
	agent.logger.Info("specialization begin...")

  // 创建一个可取消的 context
	agentCtx, cancel := context.WithCancel(ctx)
	defer cancel()
  // 创建一个 task channel
	taskCh := make(chan error, 2)

	go func() {
		if err := agent.fetcher.Fetch(agentCtx, req.Url, req.FileName); err != nil {
			taskCh <- err
      // 如果出错，则取消 context
			cancel()
		} else {
			taskCh <- nil
		}
	}()
	go func() {
		if err := ioutil.WriteFile(appKeyFilePath, []byte(req.AppKey), 0644); err != nil {
			taskCh <- err
      // 如果出错，则取消 context
			cancel()
		} else {
			taskCh <- nil
		}
	}()

	// wait for the sub task, return error if any
	taskCount := 2
  // 迭代 task channel
	for c := range taskCh {
		if c != nil {
      // 如果有错误，则立即返回错误
			return c
		} else {
			taskCount--
		}
		if taskCount <= 0 {
			break
		}
	}

	agent.logger.Info("specialization done.")
	return nil
}
```

## 5.依赖管理

相比 Java，Go 没有类似 Maven，Gradle 这样优秀的依赖管理系统，其依赖管理非常粗放，~~参考 C~~。

虽然可以通过 `go get xxx` 来下载依赖，但它做的仅仅是帮你把源码下载到相关目录，并不提供类似于版本控制、依赖合并等高级功能。所以很多 Go 项目在使用依赖时仅仅是将依赖下载到 `GOPATH` 下，供 `go build` 时链接。

归根结底，造成这种情况的原因可能是 Go 项目结构太过自由，缺少模块的概念。

但 Go 1.11版本开始添加了对模块的实验性支持，1.12版本删除了对 `GOPATH` 的支持。使得 Go 终于有了像样的依赖管理。

可以用环境变量 `GO111MODULE` 开启或关闭模块支持，它有三个可选值：`off`、`on`、`auto`，默认值是 `auto`。

- `GO111MODULE=off` 无模块支持，go 会从 GOPATH 和 vendor 文件夹寻找包。
- `GO111MODULE=on` 模块支持，go 会忽略 GOPATH 和 vendor 文件夹，只根据 `go.mod` 下载依赖。
- `GO111MODULE=auto` 在 `$GOPATH/src` 外面且根目录有 `go.mod` 文件时，开启模块支持。

### 5.1 模块定义

每个模块化的项目根目录下都应该有一个 `go.mod` 文件，这个文件不用手写，可以通过

```shell
go mod init xxx # xxx 是模块名
```

生成。在项目目录下使用 `go get` 命令时会自动填写这个文件。

```go
module agent

go 1.13

require (
	github.com/natefinch/lumberjack v2.0.0+incompatible
	go.uber.org/atomic v1.5.1 // indirect
	go.uber.org/multierr v1.4.0 // indirect
	go.uber.org/zap v1.13.0
	golang.org/x/lint v0.0.0-20191125180803-fdd1cda4f05f // indirect
	golang.org/x/net v0.0.0-20200114155413-6afb5195e5aa
	golang.org/x/tools v0.0.0-20200115044656-831fdb1e1868 // indirect
)

```

上面是一个依赖列表，可以看到依赖中包含了依赖的版本号。

### 5.2 版本规范

Go 模块版本是有严格规范的，上面文件中很多依赖是不合规范的。详细规范可以参考[Go Modules: v2 and Beyond](https://blog.golang.org/v2-go-modules)。简单而言，当需要更新模块的大版本号时，应当更改模块名，以保证兼容性。调用方也需要同步修改引用路径为大版本号。

> 每次大版本更新都会更新module的路径，也就是说在module的后面修改相应的版本号，所以后面的大版本路径一般会如下：
>
> ```go
>module xxx.com/arch/xxx.git/v3
> module xxx.com/arch/xxx.git/v4
> module xxx.com/arch/xxx.git/v5
> ```
> 
> - 如果遇上大版本更新，业务方接入时，需要修改自己的import路径
> - 如果没有没有大版本更新，这不需要进行修改

## 参考

推荐两本书：

1. [Go 语言圣经](http://www.kancloud.cn:8080/hartnett/gopl-zh)
2. [Go 语言设计与实现](https://draveness.me/golang/)
3. [Effective Go](https://golang.org/doc/effective_go.html)

参考文章：

1. [go语言之行--golang核武器goroutine调度原理、channel详解](https://www.cnblogs.com/wdliu/p/9272220.html)

2. [Golang协程详解和应用](https://zhuanlan.zhihu.com/p/74047342)

3. [The Go scheduler](http://morsmachine.dk/go-scheduler)

4. [Goroutine 并发调度模型深度解析之手撸一个高性能 goroutine 池](https://taohuawu.club/high-performance-implementation-of-goroutine-pool)

5. [Go WaitGroup实现原理](https://my.oschina.net/renhc/blog/2249061)

6. [图解Go的channel底层原理](https://www.cnblogs.com/RyuGou/p/10776565.html)

7. [Golang-Channel原理解析](https://blog.csdn.net/u010853261/article/details/85231944)

8. https://golang.org/doc/

9. https://blog.golang.org/

10. [Go Modules: v2 and Beyond](https://blog.golang.org/v2-go-modules)

11. [Go module 如何发布 v2 及以上版本？](https://blog.cyeam.com/go/2019/03/12/go-version)

12. [Go Concurrency Patterns: Context](https://blog.golang.org/context)

13. [Share Memory By Communicating](https://blog.golang.org/codelab-share)
