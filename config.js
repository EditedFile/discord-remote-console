import dotenv from "dotenv";
dotenv.config();

export const config = {
	debug: {
		change_directory: true,
		show_executed_commands: true,
	},
	channel: process.env.CHANNEL_ID,
	token: process.env.TOKEN,
	cwd: process.env.CUSTOM_CWD || process.cwd(),
	owners: [...(process.env.OWNERS_IDS?.split(",") ?? [])],
	color: 0x00ff00,
	category_id: null,
};
