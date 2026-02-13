import chalk from "chalk";

const colors = {
	info: "cyan",
	event: "magenta",
	error: "red",
	warn: "yellow",
	ready: "green",
	cron: "blue",
};

const colorFunctions = {
	info: chalk.cyan,
	event: chalk.magenta,
	error: chalk.red,
	warn: chalk.yellow,
	ready: chalk.green,
	cron: chalk.blue,
};

function getTimestamp() {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	return `${hours}:${minutes}:${seconds}`;
}

export function Logger(type, ...args) {
	const timestamp = getTimestamp();
	const typeUpper = type.toUpperCase();
	const longest = Math.max(...Object.keys(colors).map(k => k.length));
	const padding = " ".repeat(longest - type.length);
	
	const colorFn = colorFunctions[type] || chalk.white;
	const timestampStr = chalk.gray(`[${timestamp}]`);
	const typeStr = colorFn.bold(`[${typeUpper}]${padding}`);
	const message = chalk.white(args.join(" "));
	
	console.log(`${timestampStr} ${typeStr} ${message}`);
}

export { chalk };
