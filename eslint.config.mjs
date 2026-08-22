// ESLint 9 flat config —— 纯 H5 项目：无 package.json、无插件，仅 core rules
// 用法：eslint mom-packing/Index.js
export default [
  {
    files: ["**/*.js"],
    ignores: [".zcode/**", "**/tmp.*", "**/node_modules/**"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        // 浏览器
        window: "readonly",
        document: "readonly",
        location: "readonly",
        navigator: "readonly",
        console: "readonly",
        alert: "readonly",
        Image: "readonly",
        FileReader: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Date: "readonly",
        parseInt: "readonly",
        parseFloat: "readonly",
        isNaN: "readonly",
        atob: "readonly",
        btoa: "readonly",
        // jQuery 与宿主注入
        $: "readonly",
        $Context: "readonly",
      },
    },
    rules: {
      "no-undef": "error",          // 未声明变量 → 崩点前哨
      "no-debugger": "warn",        // debugger 残留
      "no-dupe-keys": "error",      // 重复对象键
      "no-extra-semi": "warn",
      "no-constant-condition": "warn",
      eqeqeq: ["warn", "smart"],    // 现有代码大量 ==，重构时逐步收紧
    },
  },
];
