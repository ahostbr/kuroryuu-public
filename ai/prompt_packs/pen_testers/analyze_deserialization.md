---
id: analyze_deserialization
name: Pentest Deserialization Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Deserialization Analysis

## Objective

Identify deserialization sinks that accept untrusted data across all languages present in the repo, and determine whether attacker-controlled gadget chains or payload objects can be constructed.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. Enumerate deserialization sinks by language:
   - **Java**: `ObjectInputStream.readObject`, `XMLDecoder`, `XStream`, `Kryo`, `Jackson` with polymorphic type handling, `Gson` with type adapters, `FastJson`.
   - **Python**: `pickle.loads`, `pickle.load`, `shelve`, `yaml.load` (without `Loader=yaml.SafeLoader`), `jsonpickle.decode`, `marshal.loads`.
   - **Ruby**: `YAML.load`, `Marshal.load`, `Oj.load` with object mode.
   - **PHP**: `unserialize`, `yaml_parse`, POP chain targets (`__wakeup`, `__destruct`, `__toString`).
   - **.NET**: `BinaryFormatter`, `NetDataContractSerializer`, `LosFormatter`, `ObjectStateFormatter`, `SoapFormatter`, `JavaScriptSerializer` with `__type`.
   - **Node.js**: `node-serialize`, `serialize-javascript` eval paths, `vm.runInThisContext` with user input.
2. Trace each sink: does data originate from HTTP body, headers, cookies, uploaded files, message queues, IPC channels, or database blobs?
3. Check for type/class allowlisting before deserialization. Evaluate whether the allowlist is bypassable (partial class name match, nested types, generic wrappers).
4. For Java: inventory classes on the classpath that implement `Serializable` with dangerous `readObject` — check for `Runtime.exec`, `ProcessBuilder`, `JDBC` sinks, `ClassLoader` sinks.
5. For Python pickle: confirm whether `__reduce__` or `__reduce_ex__` can be reached.
6. Confirm transport encoding: Base64, hex, gzip, JSON wrapping — attacker must be able to supply raw bytes or equivalent.

## Output Files

- `Docs/reviews/pentest/<run_id>/deserialization_analysis.md`
- `Docs/reviews/pentest/<run_id>/deserialization_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "DESER-001",
      "language": "java|python|ruby|php|dotnet|nodejs",
      "library": "ObjectInputStream|pickle|yaml|unserialize|BinaryFormatter|etc.",
      "sink": "path/file.ext:line",
      "data_source": "http_body|cookie|header|file_upload|queue|ipc|db_blob",
      "allowlist_present": true,
      "allowlist_bypassable": "yes|no|unknown",
      "gadget_chain_candidate": "ysoserial module name or equivalent",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```
