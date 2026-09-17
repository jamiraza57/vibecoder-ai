import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/** Prompts the operator on the real terminal. Used as ToolContext.confirm in the CLI entry point. */
export async function confirmOnTerminal(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`\x1b[33m? ${message} [y/N] \x1b[0m`)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
