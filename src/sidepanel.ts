import "./app.css";
import { mount } from "svelte";
import ExtensionApp from "./ExtensionApp.svelte";

const app = mount(ExtensionApp, {
	target: document.getElementById("app")!,
});

export default app;
