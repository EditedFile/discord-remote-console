import { Client, EmbedBuilder, TextChannel, codeBlock } from "discord.js";
import { existsSync } from "fs";
import { exec, spawn } from "node:child_process";
import stripAnsi from "strip-ansi";
import { cpuTemperature as checkCpuTemperature, currentLoad, mem } from "systeminformation";
import { promisify } from "util";
import { config } from "../config.js";
import { chunkString } from "./chunkString.js";
import { Logger } from "./logger.js";

const execPromise = promisify(exec);

async function getSystemInfo() {
	const { main: cpuTemperature } = await checkCpuTemperature();
	const { currentLoad: cpuUsage } = await currentLoad();
	const memoryTest = await mem();
	const memoryPercentage = Number(((memoryTest.used / 1048576 / (memoryTest.total / 1048576)) * 100).toFixed(2));
	return {
		cpuTemperature,
		cpuUsage,
		memoryPercentage
	};
}

async function executeCommand(command) {
	try {
		const { stdout, stderr } = await execPromise(command, {
			cwd: config.cwd,
			env: {
				...process.env,
				COLUMNS: "128"
			},
		});
		return stdout + stderr;
	} catch (error) {
		return error;
	}
}

export async function execCommand(client, input, waitMessage) {
	try {
		if (config.debug.show_executed_commands) Logger("event", `RUNNING: ${input} IN ${config.cwd}`);
		if (input.trim() === "screen") {
			const screenOutput = await executeCommand("screen -ls");
			const sessionRegex = /(\d+\.\S+)/g;
			const sessions = String(screenOutput).match(sessionRegex);
			if (sessions && sessions.length > 0) {
				const guild = client.guilds.cache.first();
				if (guild) {
					for (const session of sessions) {
						let channel = guild.channels.cache.find(ch => ch.name === `screen-${session}`);
						if (!channel && guild.channels.create) {
							channel = await guild.channels.create({
								name: `screen-${session}`,
								type: 0
							});
						}
						if (channel && channel.isTextBased()) {
							const startEmbed = new EmbedBuilder()
								.setColor(config.color)
								.setDescription(`Started logging for screen session: ${session}`);
							await channel.send({
								embeds: [startEmbed]
							});
							const logFile = `/tmp/screen_${session}.log`;
							await executeCommand(`screen -r ${session} -X logfile ${logFile}`);
							await executeCommand(`screen -r ${session} -X log on`);
							await executeCommand(`touch ${logFile}`);
							if (existsSync(logFile)) {
								const tailProcess = spawn("tail", ["-F", logFile]);
								tailProcess.stdout.on("data", (data) => {
									{
										const logs = stripAnsi(data.toString());
										const chunks = chunkString(logs, 3000, []);
										chunks.forEach((chunk, idx) => {
											const embed = new EmbedBuilder()
												.setColor(config.color)
												.setTitle(`Logs for session ${session} (Page ${idx + 1}/${chunks.length})`)
												.setDescription(codeBlock(chunk));
											channel.send({
												embeds: [embed]
											});
										});
									}
								});
								tailProcess.stderr.on("data", (data) => {
									{
										const logs = stripAnsi(data.toString());
										const chunks = chunkString(logs, 3000, []);
										chunks.forEach((chunk, idx) => {
											const embed = new EmbedBuilder()
												.setColor(config.color)
												.setTitle(`Error in session ${session} (Page ${idx + 1}/${chunks.length})`)
												.setDescription(codeBlock(chunk));
											channel.send({
												embeds: [embed]
											});
										});
									}
								});
							}
						}
					}
					return;
				}
			} else {
				if (!config.channel) {
					Logger("error", "CHANNEL_ID is not set in config.");
					return;
				}
				const defaultChannel = client.channels.cache.get(config.channel);
				const noSessionEmbed = new EmbedBuilder()
					.setColor(config.color)
					.setDescription("No active screen sessions found.");
				await defaultChannel.send({
					embeds: [noSessionEmbed]
				});
				return;
			}
		}
		if (waitMessage.deletable && waitMessage.author && waitMessage.author.bot) {
			try {
				waitMessage.delete();
			} catch (error) {
				Logger("error", `ERROR DELETING WAIT MESSAGE: ${error}`);
			}
		}

		const { cpuTemperature, cpuUsage, memoryPercentage } = await getSystemInfo();
		const output = (await executeCommand(input)) || "No output!";
		const outputDiscord = chunkString(output.toString() || "", 3000, []);
		let targetChannel;
		if (
			waitMessage.channel instanceof TextChannel &&
			waitMessage.channel.name.startsWith("screen-")
		) {
			targetChannel = waitMessage.channel;
		} else {
			if (!config.channel)
				return Logger("error", "CHANNEL NOT FOUND! CHECK THE 'CHANNEL_ID' VARIABLE in .env.");
			targetChannel = client.channels.cache.get(config.channel);
			if (!targetChannel)
				return Logger("error", "CHANNEL NOT FOUND! CHECK THE 'CHANNEL_ID' VARIABLE in .env.");
		}

		outputDiscord.forEach((item, index) => {
			const index2 = index + 1;

			const embed = new EmbedBuilder()
				.setColor("#4f545c")
				.setTitle(`Output`)
				.setTimestamp()
				.setFooter({
					text: `Page ${index2}/${outputDiscord.length}`,
					iconURL: client.user?.displayAvatarURL()
				})
				.setDescription(codeBlock(stripAnsi(item) || "No output!"));

			if (index2 == outputDiscord.length) {
				embed.setDescription(
					`${embed.data.description}\n${codeBlock(`CWD: ${config.cwd}\nCPU: ${Math.round(cpuUsage)}% | RAM: ${Math.round(memoryPercentage)}% | Temp: ${Math.round(cpuTemperature)}°C`)}`
				);
			}

			targetChannel.send({
				embeds: [embed]
			}).catch(err => Logger("error", `ERROR SENDING OUTPUT: ${err}`));
		});
	} catch (error) {
		console.error(error);
	}
}
