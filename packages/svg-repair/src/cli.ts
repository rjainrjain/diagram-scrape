import { pathToFileURL } from "node:url";
import {
  DEFAULT_INPUT,
  DEFAULT_MODEL_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REPORT_PATH,
  repairSvgFileWithBloom,
  type RepairSvgFileOptions,
} from "./node.ts";

export function parseArgs(argv: string[]): RepairSvgFileOptions {
  const args: RepairSvgFileOptions = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    reportPath: DEFAULT_REPORT_PATH,
    modelDir: DEFAULT_MODEL_DIR,
    writeModel: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--input" && argv[i + 1]) {
      args.input = argv[++i];
    } else if (token === "--outputDir" && argv[i + 1]) {
      args.outputDir = argv[++i];
    } else if (token === "--report" && argv[i + 1]) {
      args.reportPath = argv[++i];
    } else if (token === "--modelDir" && argv[i + 1]) {
      args.modelDir = argv[++i];
    } else if (token === "--workspaceRoot" && argv[i + 1]) {
      args.workspaceRoot = argv[++i];
    } else if (token === "--no-model") {
      args.writeModel = false;
    }
  }

  return args;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const report = await repairSvgFileWithBloom(args);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("svg-repair failed:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
