// Helpers for the interactive admin command-line tools.
import readline from 'readline';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Value of "--name value" or "--name=value", or null
export function argValue(name, argv = process.argv) {
    const i = argv.indexOf(`--${name}`);
    if (i !== -1) return argv[i + 1] ?? null;
    const pref = `--${name}=`;
    const found = argv.find((a) => a.startsWith(pref));
    return found ? found.slice(pref.length) : null;
}

export function requireTerminal() {
    if (!process.stdin.isTTY) {
        throw new Error('This command must be run from an interactive terminal (passwords are never accepted as arguments).');
    }
}

export function openPrompt() {
    return readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
}

export function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, (a) => resolve(a)));
}

// Hidden input: the echo is muted while the user types
export function askHidden(rl, question) {
    return new Promise((resolve) => {
        const write = rl._writeToOutput;
        rl._writeToOutput = (s) => { if (s.includes(question)) write.call(rl, s); };
        rl.question(question, (answer) => {
            rl._writeToOutput = write;
            process.stdout.write('\n');
            resolve(answer);
        });
    });
}

// Wraps a CLI main(): prints a clean error and always closes the database pool
export async function runCli(main, closeDb) {
    try {
        await main();
    } catch (e) {
        console.error(`\nError: ${e.message}`);
        process.exitCode = 1;
    } finally {
        await closeDb();
    }
}
