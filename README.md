# discord-remote-console

A discord bot that lets you control your linux machine directly from discord. run commands, manage screen sessions, and monitor your server all through discord channels.

## requirements

- node.js 18 or higher
- linux machine
- screen installed (`sudo apt install screen`)
- discord bot with these intents enabled: server members intent, message content intent

## installation

clone the repository:

```bash
git clone https://github.com/EditedFile/discord-remote-console.git
cd discord-remote-console
```

install dependencies:

```bash
npm install
```

configure the bot by creating a `.env` file:

```bash
cp .env.example .env
nano .env
```

fill in your values:

```env
CHANNEL_ID="your_main_channel_id"
OWNERS_IDS="your_discord_user_id,another_user_id"
TOKEN="your_bot_token"
CUSTOM_CWD="/home/user"  # optional
```

start the bot:

```bash
npm start
```

## usage

Run `/setup` in your discord server to create the bot category and main-terminal channel.

in the main-terminal channel, type any linux command and the bot will execute it and show output with system stats.

## commands

- `/setup` - create bot category and channels, detect existing screen sessions
- `/new name:session` - create a new screen session with its own discord channel
- `/exit session:name` - stop a screen session and delete its channel (note: session name is optional, it will exit the screen session of the current channel if found)
- `/update` - sync discord channels with active/deleted screen sessions
- `/unsetup` - remove all bot channels and category
- `/download path:file` - download a file from the machine as a discord attachment (path is autocompleted, main-terminal only)
- `/upload file:attachment path:destination` - upload a file attachment to the machine (path is optional and autocompleted, main-terminal only)
- `/status` - show system status (cpu, memory, disk, uptime) (main-terminal only)

## screen sessions

Each screen session gets its own discord channel. type commands in that channel to send them to the session. the channel shows live output from the session (note: there may be a slight delay for each screen session channel).

## troubleshooting

If the bot ever bugs out or stops logging, just run /unsetup and do /setup again, should fix most problems.

## limitations

If you try to run an interactive script or command (such as htop, etc), the bot WILL bug out, so refrain from running those types of commands, or run them from your terminal directly.

## important note

This bot is still a work in progress, so you might encounter a lot of bugs, **use at your own risk**.