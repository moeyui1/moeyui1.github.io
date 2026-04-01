---
title: Android views绑定工具Butter Knife
tags:
  - Android
abbrlink: bc60fb49
pubDate: 2017-06-27 22:00:30
description: ""
---

在编写 Android 程序时，为了在代码中控制 xml 文件中定义的组件，我们需要通过 findViewById() 这个方法来获取到对应组件。当一个界面中含有大量组件时，往往会产生许多冗杂的代码，且需要对组件进行批量控制时，也很不方便。

[Butter Knife](http://jakewharton.github.io/butterknife/) 是一个意图帮助编程人员解决 Android 界面绑定的框架，通过注解的方式帮助减少代码量，并在编译时生成原生代码，实现安全、简单。

<!--more-->

# 导入 Butter Knife

在 Gradle 文件中添加：

```groovy
compile 'com.jakewharton:butterknife:8.6.0'
annotationProcessor 'com.jakewharton:butterknife-compiler:8.6.0'
```

# 绑定元素

可以通过编写

```java
class ExampleActivity extends Activity {
  @BindView(R.id.title) TextView title;
  @BindView(R.id.subtitle) TextView subtitle;
  @BindView(R.id.footer) TextView footer;

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.simple_activity);
    ButterKnife.bind(this);
  }
}
```

来绑定界面元素。

也可以通过添加 `@Nullable` 注解，当元素找不到时，不进行绑定。

# 绑定元素列表

通过注释我们甚至可以绑定多个元素，这使得我们可以批量地操作元素：

```java
@BindViews({ R.id.first_name, R.id.middle_name, R.id.last_name })
List<EditText> nameViews;

ButterKnife.apply(nameViews, DISABLE);
ButterKnife.apply(nameViews, ENABLED, false);
```



你甚至可以定义自己的操作：

```java
static final ButterKnife.Action<View> DISABLE = new ButterKnife.Action<View>() {
  @Override public void apply(View view, int index) {
    view.setEnabled(false);
  }
};
static final ButterKnife.Setter<View, Boolean> ENABLED = new ButterKnife.Setter<View, Boolean>() {
  @Override public void set(View view, Boolean value, int index) {
    view.setEnabled(value);
  }
};
```

# 绑定监听器

注解也可以用于绑定 Listener，

```java
@OnClick(R.id.submit)
public void sayHi(Button button) {
  button.setText("Hello!");
}
```

这里绑定的方法中，方法参数是可以被框架自动注入的。

甚至可以绑定多个元素的 Listener，

```java
@OnClick({ R.id.door1, R.id.door2, R.id.door3 })
public void pickDoor(DoorView door) {
  if (door.hasPrizeBehind()) {
    Toast.makeText(this, "You win!", LENGTH_SHORT).show();
  } else {
    Toast.makeText(this, "Try again", LENGTH_SHORT).show();
  }
}
```

