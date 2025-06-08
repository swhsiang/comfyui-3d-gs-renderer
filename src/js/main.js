import { app } from "../../scripts/app.js";
import { CloudRenderer } from "./index.js";
app.registerExtension({ 
	name: "comfyui-3d-gs-renderer",
	async setup() { 
		console.log("comfyui-3d-gs-renderer Setup complete!")
		const cloudRenderer = new CloudRenderer(document.getElementById("app"));
	},
})