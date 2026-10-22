<p>
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://raw.githubusercontent.com/khm39/khm39/main/assets/header-dark.svg">
    <img
      alt="Koki — payments, serverless, and tools for AI agents"
      src="https://raw.githubusercontent.com/khm39/khm39/main/assets/header-light.svg"
      width="100%">
  </picture>
</p>

I build payment-terminal integrations and serverless backends on Cloudflare.

### What I'm working on

- **[jp-law-mcp](https://github.com/khm39/jp-law-mcp)** · 🟢 Working<br>
  MCP server for searching and reading Japanese statutes.
- **KLK — Kirei Layout Kernel** · ⚪ Spec in progress<br>
  Graph layout engine for diagrams that humans and AI agents both read
  without ambiguity. Rust core, WASM and Python bindings, ELK JSON interop.

**Stack:** Cloudflare Workers / Containers · Hono · Kotlin · Rust · Typst

**Elsewhere:** [X](https://x.com/tkhm39)

---

### Today's receipt

<p align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://raw.githubusercontent.com/khm39/khm39/main/assets/receipt-dark.svg">
    <img
      alt="Thermal-printer style receipt summarizing my GitHub activity"
      src="https://raw.githubusercontent.com/khm39/khm39/main/assets/receipt-light.svg"
      width="360">
  </picture>
</p>

<p align="center">
  <sub>Printed every morning (JST) by GitHub Actions. The numbers are real.
  The coffee count is an estimate.</sub>
</p>

<details>
<summary><b>Tap to pay</b></summary>

```console
$ koki-terminal charge --amount 1 --currency coffee
Waiting for card ......... ok
Reading card ............. ok
Authorizing .............. DECLINED

error: card_declined
decline_code: insufficient_caffeine
```

Try [buying me a coffee](https://github.com/sponsors/khm39) instead.
That one goes through.

</details>
