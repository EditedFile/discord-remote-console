import { exec } from "child_process";
import { EmbedBuilder, TextChannel, codeBlock } from "discord.js";
import fs, { existsSync } from "node:fs";
import path from "node:path";
import stripAnsi from "strip-ansi";
import { promisify } from "util";
import { config } from "../../config.js";
import { chunkString } from "../../utils/chunkString.js";
import { execCommand } from "../../utils/execCommand.js";
import { Logger } from "../../utils/logger.js";

const execPromise = promisify(exec);

export async function messageCreate(client, message) {
	try {
		if (message.author.bot) return;
		if (!(message.channel instanceof TextChannel)) return;

		if(!message.channel.name.startsWith("screen-") && message.channel.id !== config.channel) return;

		const channel = message.channel;
		const channelName = channel.name;

		if (channelName.startsWith("screen-")) {
			const topic = channel.topic;
			const session =
				topic?.trim() ||
				channelName.replace("screen-", "").replace(/(\d+)([A-Za-z]+)/, "$1.$2");
			
			try {
				const { stdout } = await execPromise("screen -ls");
				const sessionRegex = /(\d+\.\S+)/g;
				const activeSessions = stdout.match(sessionRegex) || [];
				
				if (!activeSessions.includes(session)) {
					const errorEmbed = new EmbedBuilder()
						.setColor(0xED4245) // Red color
						.setTitle("Session Not Found")
						.setDescription(
							`Screen session \`${session}\` no longer exists.\n\n` +
							`The session may have been stopped or crashed.\n` +
							`Use \`/update\` to sync channels with active sessions.`
						)
						.setFooter({
							text: "discord-ssh",
							iconURL: client.user.displayAvatarURL()
						})
						.setTimestamp();
					
					return await message.reply({
						embeds: [errorEmbed]
					});
				}
			} catch (error) {
			}
			
			if (config.debug.show_executed_commands)
				Logger(
					"event",
					`Sending command to screen session ${session}: ${message.content}`,
				);
			const safeContent = message.content.replace(/'/g, "'\\''");
			
			try {
				await execPromise(`screen -S ${session} -X stuff '${safeContent}\\n'`);
				
				await new Promise(resolve => setTimeout(resolve, 2000));
				
				const logFile = `/tmp/screen_${session}.log`;
				if (existsSync(logFile)) {
					try {
						const { stdout: fileStats } = await execPromise(`stat -c %s ${logFile}`);
						const fileSize = parseInt(fileStats.trim());
						
						if (fileSize > 0) {
							const { stdout } = await execPromise(`tail -n 100 ${logFile}`);
							const output = stripAnsi(stdout);
							
							if (output.trim()) {
								const chunks = chunkString(output, 3000, []);
								
								chunks.forEach((chunk, idx) => {
									const embed = new EmbedBuilder()
										.setColor(config.color)
										.setTitle(`Output (Page ${idx + 1}/${chunks.length})`)
										.setDescription(codeBlock(chunk))
										.setTimestamp();
									message.channel.send({
										embeds: [embed]
									}).catch(() => {});
								});
							} else {
								await message.react('✅').catch(() => {});
							}
						} else {
							await message.react('✅').catch(() => {});
						}
					} catch (error) {
						await message.react('✅').catch(() => {});
					}
				} else {
					await message.react('✅').catch(() => {});
				}
				
				Logger("event", `RAN IN SCREEN: ${session}`);
			} catch (error) {
				Logger("error", `FAILED TO RUN IN SCREEN: ${error}`);
				const errorEmbed = new EmbedBuilder()
					.setColor(0xED4245)
					.setTitle("Command Failed")
					.setDescription(`Failed to send command to session \`${session}\`\n\n**Error:**\n\`\`\`${error.message}\`\`\``)
					.setFooter({
						text: "discord-ssh",
						iconURL: client.user.displayAvatarURL()
					})
					.setTimestamp();
				
				await message.reply({
					embeds: [errorEmbed]
				});
			}
			return;
		}

		if (!config.owners.includes(message.author.id)) return;
		if (!message.content) return;

		const [command, ...args] = message.content.split(" ");

		if (command === "cd") {
			const newCWD = args.join(" ");
			if (!newCWD) return;
			const resolvedPath = path.resolve(config.cwd, newCWD);
			if (!fs.existsSync(resolvedPath)) {
				const errorEmbed = new EmbedBuilder()
					.setDescription(
						`**Directory does not exist**`,
					)
					.setColor(config.color);
				return message.reply({
					embeds: [errorEmbed]
				});
			}
			try {
				process.chdir(resolvedPath);
				if (config.debug.change_directory)
					Logger("event", `Changed directory to ${resolvedPath}`);
				const changedEmbed = new EmbedBuilder()
					.setDescription(
						`**Changed directory to \`${resolvedPath}\`**`,
					)
					.setColor(config.color);
				config.cwd = resolvedPath;
				return message.reply({
					embeds: [changedEmbed]
				});
			} catch (error) {
				if (config.debug.change_directory)
					Logger("error", `Error changing directory: ${error}`);
				const failEmbed = new EmbedBuilder()
					.setDescription(
						`**Error changing directory**`,
					)
					.setColor(config.color);
				return message.reply({
					embeds: [failEmbed]
				});
			}
		}

		await execCommand(client, message.content, message);
	} catch (error) {
		Logger("error", `Error executing command: ${error}`);
	}
}
