import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";
import { Logger } from "./logger.js";

export default async function loadEvents(client) {
	try {
		const loadTime = performance.now();

		const directories = readdirSync(`${process.cwd()}/events/`);
		const events = [];

		for (const directory of directories) {
			const files = readdirSync(`${process.cwd()}/events/${directory}`).filter((file) => file.endsWith(".js"));
			for (const file of files) {
				events.push(`${process.cwd()}/events/${directory}/${file}`);
			}
		}

		for (const file of events) {
			const fileURL = pathToFileURL(file);
			await import(fileURL.toString()).then((e) => {
				const eventName = basename(file, ".js");
				client.on(eventName, e[eventName].bind(null, client));
			});
		}

	} catch (error) {
		Logger("error", `ERROR LOADING EVENTS: ${error}`);
	}
}
