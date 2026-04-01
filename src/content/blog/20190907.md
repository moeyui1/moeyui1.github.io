---
title: Spring CGLIB 动态代理子类导致的注解丢失
tags:
  - Spring
  - Java
category: 开发
abbrlink: 43a5efe7
pubDate: 2019-09-07 22:02:02
description: ""
---

在 Spring 中可以使用类级别的`@Validated` 注解对整个类的方法做校验，实际运行时，Spring 会通过 CGLIB 生成基于类的代理，这个生成的代理是原始类的子类。而这个自动生成的子类不会继承原始类的注解，故在编写 Component 处理逻辑时检测不到原始类的注解。

<!--more-->

## 问题再现

如下的一个类：

```java
@Validated
@Slf4j
@Controller
@Component("abb")
// 自定义注解
@CustomAnnotation
public class SimpleService {

    private int cupCounter = 1;

    @Function("echo")
    public String echo(String str) {
        return str;
    }

    @Function
    public String hello() {
        return "hello";
    }
}
```

同时使用`@Validated`和`@CustomAnnotation`注解的类没有扫描到`@CustomAnnotation`注解，断点观察被`@Validated`注解的类注册到 Context 时的`beanType`并非原来的类型，而是 CGLIB 生成的子类。并且这个子类没有注解。

[![n1qlnK.md.png](https://s2.ax1x.com/2019/09/07/n1qlnK.md.png)](https://imgchr.com/i/n1qlnK)

![n1qact.png](https://s2.ax1x.com/2019/09/07/n1qact.png)

使用`@Validated`可以让Spring帮你做类的数据校验。猜想为了实现校验，Spring使用了CGLIB代理（当需要代理的类没有实现接口时，Spring 总是使用基于类的动态代理即CGLIB），注册的bean是一个CGLIB子类，所以丢失了注解信息。

## 解决

既然生成的代理类会丢失注解信息，那么 Spring 的注解如`@Controller`又是如何工作的呢？

翻阅一下 Spring 源码，参考[SpringMVC源码之Controller查找原理](https://zhuanlan.zhihu.com/p/33678399)。

- `AbstractHandlerMethodMapping#processCandidateBean`

    ```java
    protected void processCandidateBean(String beanName) {
        Class<?> beanType = null;
        try {
            beanType = obtainApplicationContext().getType(beanName);
        }
        catch (Throwable ex) {
            // An unresolvable bean type, probably from a lazy bean - let's ignore it.
            if (logger.isTraceEnabled()) {
                logger.trace("Could not resolve type for bean '" + beanName + "'", ex);
            }
        }
        // 在这里判断bean是否为一个 Handler
        if (beanType != null && isHandler(beanType)) {
            detectHandlerMethods(beanName);
        }
    }
    ```

- `RequestMappingHandlerMapping#isHandler`

    ```java
    /**
    	 * {@inheritDoc}
    	 * <p>Expects a handler to have either a type-level @{@link Controller}
    	 * annotation or a type-level @{@link RequestMapping} annotation.
    	 */
    @Override
    protected boolean isHandler(Class<?> beanType) {
        //逻辑上通过判断是否含 @Controller 注解，但这里使用了一个 AnnotatedElementUtils
        return (AnnotatedElementUtils.hasAnnotation(beanType, Controller.class) ||
                AnnotatedElementUtils.hasAnnotation(beanType, RequestMapping.class));
    }
    ```

- `AnnotatedElementUtils#hasAnnotation`

    ```java
    /**
    	 * Determine if an annotation of the specified {@code annotationType}
    	 * is <em>available</em> on the supplied {@link AnnotatedElement} or
    	 * within the annotation hierarchy <em>above</em> the specified element.
    	 * <p>If this method returns {@code true}, then {@link #findMergedAnnotationAttributes}
    	 * will return a non-null value.
    	 * <p>This method follows <em>find semantics</em> as described in the
    	 * {@linkplain AnnotatedElementUtils class-level javadoc}.
    	 * @param element the annotated element
    	 * @param annotationType the annotation type to find
    	 * @return {@code true} if a matching annotation is present
    	 * @since 4.3
    	 * @see #isAnnotated(AnnotatedElement, Class)
    	 */
    public static boolean hasAnnotation(AnnotatedElement element, Class<? extends Annotation> annotationType) {
        // Shortcut: directly present on the element, with no processing needed?
        // 这是传统的判断方法
        if (element.isAnnotationPresent(annotationType)) {
            return true;
        }
        // 关键在于 searchWithFindSemantics 方法
        return Boolean.TRUE.equals(searchWithFindSemantics(element, annotationType, null, alwaysTrueAnnotationProcessor));
    }
    ```

- `AnnotatedElementUtils#searchWithFindSemantics`

    ```java
    /**
    	 * Search for annotations of the specified {@code annotationName} or
    	 * {@code annotationType} on the specified {@code element}, following
    	 * <em>find semantics</em>.
    	 * @param element the annotated element
    	 * @param annotationType the annotation type to find
    	 * @param annotationName the fully qualified class name of the annotation
    	 * type to find (as an alternative to {@code annotationType})
    	 * @param processor the processor to delegate to
    	 * @return the result of the processor (potentially {@code null})
    	 * @since 4.2
    	 */
    	@Nullable
    	private static <T> T searchWithFindSemantics(AnnotatedElement element,
    			@Nullable Class<? extends Annotation> annotationType,
    			@Nullable String annotationName, Processor<T> processor) {
    
    		// 这里有很多个重载方法，一直点进去看
    		return searchWithFindSemantics(element,
    				(annotationType != null ? Collections.singleton(annotationType) : Collections.emptySet()),
    				annotationName, null, processor);
    	}
    
    //...
    // 到这里可以看到对 bean class 进行判断
    else if (element instanceof Class) {
    					Class<?> clazz = (Class<?>) element;
    					if (!Annotation.class.isAssignableFrom(clazz)) {
    						// Search on interfaces
    						for (Class<?> ifc : clazz.getInterfaces()) {
    							T result = searchWithFindSemantics(ifc, annotationTypes, annotationName,
    									containerType, processor, visited, metaDepth);
    							if (result != null) {
    								return result;
    							}
    						}
    						// Search on superclass
    						// 判断了父类，CGLIB 生成的子类父类是原始类，所以就能找到原来的注解
    						Class<?> superclass = clazz.getSuperclass();
    						if (superclass != null && superclass != Object.class) {
    							T result = searchWithFindSemantics(superclass, annotationTypes, annotationName,
    									containerType, processor, visited, metaDepth);
    							if (result != null) {
    								return result;
    							}
    						}
    					}
    				}
    //...
    ```

这样就知道了`@Controller`是如何支持代理类了，故使用`AnnotatedElementUtils`来判断注解就OK了？

当然没那么简单，这样修改后，又出现了新问题：

### 方法级别的注解也丢了

`AnnotatedElementUtils`只能用于类级别注解，而 CGLIB 代理类中的方法注解也丢失了

别忘了Spring中还使用了方法级别注解`@RequestMapping`，于是又翻看源码，观察上面的源码找到 Handler 之后是如何处理方法级别注解的。

- `AbstractHandlerMethodMapping#detectHandlerMethods`

    ```java
    /**
    	 * Look for handler methods in the specified handler bean.
    	 * @param handler either a bean name or an actual handler instance
    	 * @see #getMappingForMethod
    	 */
    	protected void detectHandlerMethods(Object handler) {
    		Class<?> handlerType = (handler instanceof String ?
    				obtainApplicationContext().getType((String) handler) : handler.getClass());
    
    		if (handlerType != null) {
    			// 在这里获取代理子类的原始类型
    			Class<?> userType = ClassUtils.getUserClass(handlerType);
    			Map<Method, T> methods = MethodIntrospector.selectMethods(userType,
    					(MethodIntrospector.MetadataLookup<T>) method -> {
    						try {
    							return getMappingForMethod(method, userType);
    						}
    						catch (Throwable ex) {
    							throw new IllegalStateException("Invalid mapping on handler class [" +
    									userType.getName() + "]: " + method, ex);
    						}
    					});
    			if (logger.isTraceEnabled()) {
    				logger.trace(formatMappings(userType, methods));
    			}
    			methods.forEach((method, mapping) -> {
    				Method invocableMethod = AopUtils.selectInvocableMethod(method, userType);
    				registerHandlerMethod(handler, invocableMethod, mapping);
    			});
    ```

- `ClassUtils#getUserClass(java.lang.Class<?>)`

    ```java
    /**
    	 * Return the user-defined class for the given class: usually simply the given
    	 * class, but the original class in case of a CGLIB-generated subclass.
    	 * @param clazz the class to check
    	 * @return the user-defined class
    	 */
    public static Class<?> getUserClass(Class<?> clazz) {
        if (clazz.getName().contains(CGLIB_CLASS_SEPARATOR)) {
            Class<?> superclass = clazz.getSuperclass();
            if (superclass != null && superclass != Object.class) {
                return superclass;
            }
        }
        return clazz;
    }
    ```

由`ClassUtils`的注解可知，通过这个方法可以直接获取到原始类型，Spring在这之后直接处理原始类型的方法。

那为什么不在`@Controller`中也获取原始类型呢？通过上面的源码可以看到`isHandler`的判断逻辑非常的复杂，可能考虑到某些代理子类上可能会有`@Controller`注解？

## 总结

判断 Spring bean 的注解时，考虑到 bean 有可能是动态代理子类，使用`isAnnotationPresent`或`getAnnotation`等方法不能获取到原始类的注解。应该使用`AnnotatedElementUtils`来判断类级别注解，对于方法级别甚至参数级别注解，应使用`ClassUtils`获取原始类的 Class 进行判断。 