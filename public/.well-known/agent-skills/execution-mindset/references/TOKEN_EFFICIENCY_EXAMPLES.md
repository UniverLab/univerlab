# Token Efficiency — Examples

Scenarios showing how to be lean in commands and responses.

---

## Command Optimization

### 1. Filtered build output
```
Bad: gradle clean build

Good: gradle clean build 2>&1 | tail -n 20

Reason: Only show the result, not hundreds of lines of build logs
```

### 2. Focused test output
```
Bad: mvn test

Good: mvn test 2>&1 | grep -E "(BUILD|ERROR|FAIL|Tests run)"

Reason: Show only test summary and failures, not all test output
```

### 3. Recent logs only
```
Bad: docker logs container

Good: docker logs container 2>&1 | tail -n 50

Reason: Show recent activity, not entire log history
```

---

## Response Optimization

### 4. Concise confirmation
```
Bad: "I have successfully completed the task you requested. The file has been created as specified."

Good: "Created file.txt"

Reason: User can see the result, no need for verbose confirmation
```

### 5. Direct code presentation
```
Bad: "Here is the code I wrote for you: [long explanation] [code]"

Good: "```python
[code]
```"

Reason: Code speaks for itself — explanation only if asked
```

### 6. Focused error reporting
```
Bad: "The command failed with error: [full stack trace]"

Good: "Error: Connection refused — is the service running?"

Reason: Extract the key error, suggest next steps
```

---

## File Reading Optimization

### 7. Targeted file reading
```
Bad: read_file(path="large_file.txt")

Good: read_file(path="large_file.txt", limit=100)

Reason: Read only what's needed, not entire large files
```

### 8. Specific section reading
```
Bad: read entire config file to find timeout

Good: grep(pattern="timeout", path="config.py")

Reason: Find exactly what's needed without reading whole file
```

---

## The Rule in One Line

> Every token costs time and money — be lean without losing substance.
> Filter commands, focus responses, read only what's needed.
