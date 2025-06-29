import "./app.css";
import ExtensionApp from "./ExtensionApp.svelte";

const app = new ExtensionApp({
	target: document.getElementById("app")!,
});

export default app;