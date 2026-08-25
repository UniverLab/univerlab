# Design Patterns — Catalog and Selection Guide

Comprehensive guide to design patterns with use cases and selection criteria.

---

## Pattern Selection Framework

### When to Use a Pattern

✅ **Use a pattern when:**
- You have a recurring structural problem
- The simplest approach creates maintenance issues
- You need to manage complexity or change
- The pattern solves a specific problem you actually have

❌ **Don't use a pattern when:**
- The problem is simple (function/conditional suffices)
- There's only one implementation (don't abstract for one case)
- The pattern adds more code than the problem warrants
- You're using it because "it feels right" rather than solving a concrete problem

---

## Creational Patterns

### Singleton
**Purpose:** Ensure a class has only one instance and provide a global point of access.

**Use when:**
- Exactly one instance needed (configuration, logging, connection pool)
- Lazy initialization required
- Global access point needed

**Avoid when:**
- Can use dependency injection instead
- Need multiple instances in tests
- Global state causes issues

**Example:**
```java
public class DatabaseConnection {
    private static DatabaseConnection instance;
    
    private DatabaseConnection() {}
    
    public static synchronized DatabaseConnection getInstance() {
        if (instance == null) {
            instance = new DatabaseConnection();
        }
        return instance;
    }
}
```

---

### Factory Method
**Purpose:** Define an interface for creating an object, but let subclasses decide which class to instantiate.

**Use when:**
- Don't know beforehand the exact types needed
- Want to provide hooks for subclasses
- Need to centralize object creation

**Example:**
```java
public interface PaymentGateway {
    void processPayment(double amount);
}

public class CreditCardGateway implements PaymentGateway {
    public void processPayment(double amount) {
        // process credit card
    }
}

public class PayPalGateway implements PaymentGateway {
    public void processPayment(double amount) {
        // process PayPal
    }
}

public class PaymentGatewayFactory {
    public PaymentGateway createGateway(String type) {
        if (type.equals("credit")) return new CreditCardGateway();
        if (type.equals("paypal")) return new PayPalGateway();
        throw new IllegalArgumentException("Unknown gateway type");
    }
}
```

---

### Abstract Factory
**Purpose:** Provide an interface for creating families of related or dependent objects without specifying their concrete classes.

**Use when:**
- System should be independent of how its objects are created
- System configured with multiple families of objects
- Need to enforce constraints between objects

**Example:**
```java
public interface GUIFactory {
    Button createButton();
    Checkbox createCheckbox();
}

public class WindowsFactory implements GUIFactory {
    public Button createButton() { return new WindowsButton(); }
    public Checkbox createCheckbox() { return new WindowsCheckbox(); }
}

public class MacFactory implements GUIFactory {
    public Button createButton() { return new MacButton(); }
    public Checkbox createCheckbox() { return new MacCheckbox(); }
}
```

---

### Builder
**Purpose:** Separate the construction of a complex object from its representation.

**Use when:**
- Object creation is complex (many optional parameters)
- Want to create different representations
- Need to construct object step-by-step

**Example:**
```java
public class Pizza {
    private String size;
    private boolean cheese;
    private boolean pepperoni;
    private boolean mushrooms;
    
    // Private constructor
    private Pizza(Builder builder) {
        this.size = builder.size;
        this.cheese = builder.cheese;
        this.pepperoni = builder.pepperoni;
        this.mushrooms = builder.mushrooms;
    }
    
    public static class Builder {
        private String size;
        private boolean cheese = false;
        private boolean pepperoni = false;
        private boolean mushrooms = false;
        
        public Builder(String size) {
            this.size = size;
        }
        
        public Builder cheese(boolean value) {
            cheese = value;
            return this;
        }
        
        public Builder pepperoni(boolean value) {
            pepperoni = value;
            return this;
        }
        
        public Builder mushrooms(boolean value) {
            mushrooms = value;
            return this;
        }
        
        public Pizza build() {
            return new Pizza(this);
        }
    }
}

// Usage:
Pizza pizza = new Pizza.Builder("LARGE")
    .cheese(true)
    .pepperoni(true)
    .build();
```

---

### Prototype
**Purpose:** Specify the kinds of objects to create using a prototypical instance, and create new objects by copying this prototype.

**Use when:**
- Object creation is expensive
- Need to hide complexity of creating new instances
- Want to avoid subclassing

**Example:**
```java
public abstract class Shape implements Cloneable {
    private String id;
    protected String type;
    
    abstract void draw();
    
    public String getType() {
        return type;
    }
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public Object clone() {
        Object clone = null;
        try {
            clone = super.clone();
        } catch (CloneNotSupportedException e) {
            e.printStackTrace();
        }
        return clone;
    }
}

public class Rectangle extends Shape {
    public Rectangle() {
        type = "Rectangle";
    }
    
    @Override
    public void draw() {
        System.out.println("Inside Rectangle::draw() method.");
    }
}

public class Circle extends Shape {
    public Circle() {
        type = "Circle";
    }
    
    @Override
    public void draw() {
        System.out.println("Inside Circle::draw() method.");
    }
}

// Usage:
ShapeCache.loadCache();
Shape clonedShape = (Shape) ShapeCache.getShape("1");
```

---

## Structural Patterns

### Adapter
**Purpose:** Convert the interface of a class into another interface clients expect.

**Use when:**
- Want to use existing class with incompatible interface
- Need to create reusable class that cooperates with unrelated classes

**Example:**
```java
public interface MediaPlayer {
    void play(String audioType, String fileName);
}

public interface AdvancedMediaPlayer {
    void playVlc(String fileName);
    void playMp4(String fileName);
}

public class VlcPlayer implements AdvancedMediaPlayer {
    public void playVlc(String fileName) {
        System.out.println("Playing vlc file: " + fileName);
    }
    public void playMp4(String fileName) {
        // do nothing
    }
}

public class Mp4Player implements AdvancedMediaPlayer {
    public void playVlc(String fileName) {
        // do nothing
    }
    public void playMp4(String fileName) {
        System.out.println("Playing mp4 file: " + fileName);
    }
}

public class MediaAdapter implements MediaPlayer {
    AdvancedMediaPlayer advancedMusicPlayer;
    
    public MediaAdapter(String audioType) {
        if (audioType.equalsIgnoreCase("vlc")) {
            advancedMusicPlayer = new VlcPlayer();
        } else if (audioType.equalsIgnoreCase("mp4")) {
            advancedMusicPlayer = new Mp4Player();
        }
    }
    
    public void play(String audioType, String fileName) {
        if (audioType.equalsIgnoreCase("vlc")) {
            advancedMusicPlayer.playVlc(fileName);
        } else if (audioType.equalsIgnoreCase("mp4")) {
            advancedMusicPlayer.playMp4(fileName);
        }
    }
}
```

---

### Bridge
**Purpose:** Decouple an abstraction from its implementation so that the two can vary independently.

**Use when:**
- Want to separate interface from implementation
- Both should be extensible independently
- Changes in implementation shouldn't affect clients

**Example:**
```java
public interface DrawAPI {
    void drawCircle(int radius, int x, int y);
}

public class RedCircle implements DrawAPI {
    public void drawCircle(int radius, int x, int y) {
        System.out.println("Drawing Circle[ color: red, radius: " + radius + ", x: " + x + ", y: " + y + "]");
    }
}

public class GreenCircle implements DrawAPI {
    public void drawCircle(int radius, int x, int y) {
        System.out.println("Drawing Circle[ color: green, radius: " + radius + ", x: " + x + ", y: " + y + "]");
    }
}

public abstract class Shape {
    protected DrawAPI drawAPI;
    
    protected Shape(DrawAPI drawAPI) {
        this.drawAPI = drawAPI;
    }
    
    public abstract void draw();
}

public class Circle extends Shape {
    private int x, y, radius;
    
    public Circle(int x, int y, int radius, DrawAPI drawAPI) {
        super(drawAPI);
        this.x = x;
        this.y = y;
        this.radius = radius;
    }
    
    public void draw() {
        drawAPI.drawCircle(radius, x, y);
    }
}
```

---

### Composite
**Purpose:** Compose objects into tree structures to represent part-whole hierarchies.

**Use when:**
- Want to represent part-whole hierarchies
- Clients should treat individual objects and compositions uniformly

**Example:**
```java
public interface Employee {
    void add(Employee employee);
    void remove(Employee employee);
    Employee getChild(int i);
    String getName();
    String getDept();
    double getSalary();
    void print();
}

public class EmployeeImpl implements Employee {
    private String name;
    private String dept;
    private double salary;
    private List<Employee> subordinates;
    
    public EmployeeImpl(String name, String dept, double salary) {
        this.name = name;
        this.dept = dept;
        this.salary = salary;
        subordinates = new ArrayList<Employee>();
    }
    
    public void add(Employee e) {
        subordinates.add(e);
    }
    
    public void remove(Employee e) {
        subordinates.remove(e);
    }
    
    public Employee getChild(int i) {
        return subordinates.get(i);
    }
    
    public String getName() {
        return name;
    }
    
    public String getDept() {
        return dept;
    }
    
    public double getSalary() {
        return salary;
    }
    
    public void print() {
        System.out.println("Name:" + getName());
        System.out.println("Dept:" + getDept());
        System.out.println("Salary:" + getSalary());
        
        for (Employee e : subordinates) {
            e.print();
        }
    }
}
```

---

## Behavioral Patterns

### Observer
**Purpose:** Define a one-to-many dependency between objects so that when one object changes state, all its dependents are notified.

**Use when:**
- Change in one object requires changing others
- Don't know how many objects need to be changed
- Objects should be loosely coupled

**Example:**
```java
public interface Subject {
    void registerObserver(Observer o);
    void removeObserver(Observer o);
    void notifyObservers();
}

public interface Observer {
    void update(float temp, float humidity, float pressure);
}

public class WeatherData implements Subject {
    private List<Observer> observers;
    private float temperature;
    private float humidity;
    private float pressure;
    
    public WeatherData() {
        observers = new ArrayList<Observer>();
    }
    
    public void registerObserver(Observer o) {
        observers.add(o);
    }
    
    public void removeObserver(Observer o) {
        int i = observers.indexOf(o);
        if (i >= 0) {
            observers.remove(i);
        }
    }
    
    public void notifyObservers() {
        for (Observer observer : observers) {
            observer.update(temperature, humidity, pressure);
        }
    }
    
    public void measurementsChanged() {
        notifyObservers();
    }
    
    public void setMeasurements(float temperature, float humidity, float pressure) {
        this.temperature = temperature;
        this.humidity = humidity;
        this.pressure = pressure;
        measurementsChanged();
    }
}
```

---

### Strategy
**Purpose:** Define a family of algorithms, encapsulate each one, and make them interchangeable.

**Use when:**
- Multiple related classes differ only in behavior
- Need different variants of an algorithm
- Algorithm uses data unknown to clients
- Want to isolate algorithm implementation from clients

**Example:**
```java
public interface PaymentStrategy {
    void pay(int amount);
}

public class CreditCardStrategy implements PaymentStrategy {
    private String name;
    private String cardNumber;
    private String cvv;
    private String dateOfExpiry;
    
    public CreditCardStrategy(String name, String cardNumber, String cvv, String dateOfExpiry) {
        this.name = name;
        this.cardNumber = cardNumber;
        this.cvv = cvv;
        this.dateOfExpiry = dateOfExpiry;
    }
    
    @Override
    public void pay(int amount) {
        System.out.println(amount + " paid with credit/debit card");
    }
}

public class PayPalStrategy implements PaymentStrategy {
    private String emailId;
    private String password;
    
    public PayPalStrategy(String email, String password) {
        this.emailId = email;
        this.password = password;
    }
    
    @Override
    public void pay(int amount) {
        System.out.println(amount + " paid using PayPal");
    }
}

public class ShoppingCart {
    private PaymentStrategy paymentStrategy;
    
    public void setPaymentStrategy(PaymentStrategy paymentStrategy) {
        this.paymentStrategy = paymentStrategy;
    }
    
    public void checkout(int amount) {
        paymentStrategy.pay(amount);
    }
}
```

---

## Pattern Selection Decision Tree

### Quick Reference

```
Need a pattern?
├─ Creating objects? → Creational
│  ├─ One instance? → Singleton
│  ├─ Multiple implementations? → Factory Method
│  ├─ Families of objects? → Abstract Factory
│  ├─ Complex construction? → Builder
│  └─ Cloning? → Prototype
│
├─ Organizing objects? → Structural
│  ├─ Incompatible interfaces? → Adapter
│  ├─ Separate abstraction/implementation? → Bridge
│  ├─ Tree structures? → Composite
│  ├─ Add behavior? → Decorator
│  ├─ Simplify complex system? → Facade
│  ├─ Share objects? → Flyweight
│  └─ Control access? → Proxy
│
└─ Managing behavior? → Behavioral
   ├─ Notify changes? → Observer
   ├─ Swap algorithms? → Strategy
   ├─ Encapsulate requests? → Command
   ├─ State-dependent behavior? → State
   ├─ Algorithm steps? → Template Method
   ├─ Chain handlers? → Chain of Responsibility
   ├─ Reduce coupling? → Mediator
   ├─ Save/restore state? → Memento
   ├─ Iterate collections? → Iterator
   ├─ Add operations? → Visitor
   └─ Interpret language? → Interpreter
```

---

## Anti-Patterns to Avoid

### God Class
**Problem:** Single class handles too many responsibilities
**Solution:** Split into smaller classes with single responsibilities

### Spaghetti Code
**Problem:** Complex, tangled control flow
**Solution:** Refactor into modular components with clear interfaces

### Golden Hammer
**Problem:** Using familiar pattern for every problem
**Solution:** Choose pattern based on actual problem, not familiarity

### Over-Engineering
**Problem:** Adding complexity for "future flexibility"
**Solution:** Follow YAGNI — build only what's needed now

---

## Final Advice

> Start simple. Use patterns to solve specific problems,
> not as decoration. When in doubt, write the simplest
> code that works, then refactor when patterns emerge.
