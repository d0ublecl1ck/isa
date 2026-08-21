// Issues-as-Code documents: YAML contract, lifecycle validation, and filesystem storage.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { parseDocument, stringify } from "yaml";

const execFileAsync = promisify(execFile);

export type IssueStatus = "open" | "in-progress" | "closed" | "cancelled";
export type IssuePriority = "critical" | "high" | "medium" | "low";

export interface IssueMetadata {
  id: string;
  status: IssueStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  closed_at?: string;
  cancelled_at?: string;
  design_section?: string;
  priority?: IssuePriority;
  labels?: string[];
  parent?: string | null;
  blocked_by?: string[];
}

export interface IssueDocument {
  absolutePath: string;
  relativePath: string;
  metadata: IssueMetadata;
  title: string;
  body: string;
  content: string;
  sections: Map<string, string>;
}

export interface IssueSummary {
  id: string;
  status: IssueStatus;
  title: string;
  relativePath: string;
}

const ISSUE_STATUSES = new Set<IssueStatus>(["open", "in-progress", "closed", "cancelled"]);
const ISSUE_PRIORITIES = new Set<IssuePriority>(["critical", "high", "medium", "low"]);
const REQUIRED_SECTIONS = [
  "Background",
  "Scope",
  "Non-goals",
  "Acceptance Criteria",
  "Implementation",
  "Verification",
  "Related ADRs"
];
const METADATA_KEYS = new Set([
  "id",
  "status",
  "created_at",
  "updated_at",
  "started_at",
  "closed_at",
  "cancelled_at",
  "design_section",
  "priority",
  "labels",
  "parent",
  "blocked_by"
]);
const ISSUE_FILE_PATTERN = /^([0-9a-f]{5})-(.+)\.md$/u;

export function slugifyIssueTitle(title: string): string {
  assertSingleLine(title, "Issue title");
  const slug = title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Issue title must contain at least one letter or number.");
  }
  return slug;
}

export function createIssueId(existingIds: ReadonlySet<string>, nextUuid: () => string = randomUUID): string {
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const id = nextUuid().replaceAll("-", "").slice(0, 5).toLowerCase();
    if (/^[0-9a-f]{5}$/.test(id) && !existingIds.has(id)) {
      return id;
    }
  }
  throw new Error("Could not generate a unique five-character Issue ID.");
}

export async function createIssueFile(
  targetRoot: string,
  title: string,
  dryRun = false,
  nextUuid: () => string = randomUUID,
  options: { section?: string } = {}
): Promise<{ id: string; relativePath: string; status: "created" | "dry-run" }> {
  const root = resolve(targetRoot);
  const issueRoot = join(root, "docs", "issues");
  const existingIds = new Set((await getIssueFilePaths(root)).map((path) => basename(path).slice(0, 5)));
  const slug = slugifyIssueTitle(title);
  const metadata = createInitialIssueMetadata(options.section);

  if (dryRun) {
    const id = createIssueId(existingIds, nextUuid);
    return { id, relativePath: `docs/issues/${id}-${slug}.md`, status: "dry-run" };
  }

  await mkdir(issueRoot, { recursive: true });
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const id = createIssueId(existingIds, nextUuid);
    const relativePath = `docs/issues/${id}-${slug}.md`;
    const lockPath = join(issueRoot, `.${id}.lock`);
    let reserved = false;
    try {
      await writeFile(lockPath, "", { encoding: "utf8", flag: "wx" });
      reserved = true;
      if ((await getIssueFilePaths(root)).some((path) => basename(path).startsWith(`${id}-`))) {
        existingIds.add(id);
        continue;
      }
      const content = serializeIssueDocument(
        { id, ...metadata },
        createIssueBody(title)
      );
      await writeFile(join(root, relativePath), content, { encoding: "utf8", flag: "wx" });
      return { id, relativePath, status: "created" };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      existingIds.add(id);
    } finally {
      if (reserved) {
        await unlink(lockPath).catch((error: unknown) => {
          if (!isMissingPathError(error)) {
            throw error;
          }
        });
      }
    }
  }
  throw new Error("Could not create an Issue with a unique five-character ID.");
}

export async function listIssueDocuments(targetRoot: string): Promise<IssueDocument[]> {
  const root = resolve(targetRoot);
  const results = await readIssueDocuments(root);
  const errors = collectIssueErrors(results);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return results.flatMap((result) => result.issue ? [result.issue] : []).sort((left, right) => left.metadata.id.localeCompare(right.metadata.id));
}

export async function findIssueDocument(targetRoot: string, id: string): Promise<IssueDocument> {
  assertIssueId(id);
  const matches = (await listIssueDocuments(targetRoot)).filter((issue) => issue.metadata.id === id);
  if (matches.length === 0) {
    throw new Error(`Issue ${id} was not found under docs/issues/.`);
  }
  if (matches.length > 1) {
    throw new Error(`Issue ${id} is duplicated under docs/issues/.`);
  }
  return matches[0];
}

export async function getActiveIssues(targetRoot: string): Promise<IssueSummary[]> {
  if (!existsSync(join(resolve(targetRoot), "docs", "issues"))) {
    return [];
  }
  return (await listIssueDocuments(targetRoot))
    .filter((issue) => issue.metadata.status === "open" || issue.metadata.status === "in-progress")
    .map(toIssueSummary);
}

export async function inspectIssueDocuments(targetRoot: string): Promise<string[]> {
  const results = await readIssueDocuments(resolve(targetRoot));
  const errors = collectIssueErrors(results);
  for (const result of results) {
    if (!result.issue) {
      continue;
    }
    const status = result.issue.metadata.status;
    const archived = result.relativePath.startsWith("docs/issues/closed/");
    if ((status === "closed" || status === "cancelled") && !archived) {
      errors.push(`${result.relativePath}: ${status} Issue must be archived under docs/issues/closed/.`);
    } else if ((status === "open" || status === "in-progress") && archived) {
      errors.push(`${result.relativePath}: active Issue must live directly under docs/issues/.`);
    }
  }
  return errors;
}

export async function archiveIssueDocument(issue: IssueDocument, dryRun = false): Promise<string> {
  if (issue.relativePath.startsWith("docs/issues/closed/")) {
    return issue.relativePath;
  }
  const fileName = basename(issue.relativePath);
  const newRelativePath = `docs/issues/closed/${fileName}`;
  if (dryRun) {
    return newRelativePath;
  }
  const issueRoot = resolve(issue.absolutePath, "..");
  const root = resolve(issueRoot, "..", "..");
  const content = await readFile(issue.absolutePath, "utf8");
  const rewritten = content.replaceAll(`](assets/${issue.metadata.id}/`, `](../assets/${issue.metadata.id}/`);
  if (rewritten !== content) {
    await writeFile(issue.absolutePath, rewritten, "utf8");
  }
  await mkdir(join(issueRoot, "closed"), { recursive: true });
  try {
    await execFileAsync("git", ["mv", issue.relativePath, newRelativePath], { cwd: root });
  } catch {
    await rename(issue.absolutePath, join(issueRoot, "closed", fileName));
  }
  return newRelativePath;
}

export async function saveIssueDocument(
  issue: IssueDocument,
  metadata: IssueMetadata,
  body = issue.body,
  dryRun = false
): Promise<void> {
  if (!dryRun) {
    await writeFile(issue.absolutePath, serializeIssueDocument(metadata, body), "utf8");
  }
}

export async function renameIssueDocument(
  issue: IssueDocument,
  title: string,
  dryRun = false
): Promise<{ oldRelativePath: string; newRelativePath: string }> {
  if (issue.metadata.status === "closed" || issue.metadata.status === "cancelled") {
    throw new Error(`Issue ${issue.metadata.id} is ${issue.metadata.status} and cannot be renamed.`);
  }
  const fileName = `${issue.metadata.id}-${slugifyIssueTitle(title)}.md`;
  const newRelativePath = `docs/issues/${fileName}`;
  const newAbsolutePath = join(resolve(issue.absolutePath, ".."), fileName);
  const titleMatch = /^# .+$/m.exec(maskFencedCode(issue.body));
  if (!titleMatch || titleMatch.index === undefined) {
    throw new Error(`Issue ${issue.metadata.id} has no title to rename.`);
  }
  const body = `${issue.body.slice(0, titleMatch.index)}# ${title}${issue.body.slice(titleMatch.index + titleMatch[0].length)}`;
  const metadata = { ...issue.metadata, updated_at: new Date().toISOString() };
  const content = serializeIssueDocument(metadata, body);

  if (!dryRun) {
    if (newAbsolutePath === issue.absolutePath) {
      const temporaryPath = `${issue.absolutePath}.${randomUUID()}.tmp`;
      let temporaryCreated = false;
      try {
        await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
        temporaryCreated = true;
        await rename(temporaryPath, issue.absolutePath);
        temporaryCreated = false;
      } finally {
        if (temporaryCreated) {
          await unlink(temporaryPath).catch((error: unknown) => {
            if (!isMissingPathError(error)) {
              throw error;
            }
          });
        }
      }
    } else {
      let destinationCreated = false;
      try {
        await writeFile(newAbsolutePath, content, { encoding: "utf8", flag: "wx" });
        destinationCreated = true;
        await unlink(issue.absolutePath);
      } catch (error) {
        if (destinationCreated) {
          await unlink(newAbsolutePath);
        }
        if (isAlreadyExistsError(error)) {
          throw new Error(`Issue path already exists: ${newRelativePath}`);
        }
        throw error;
      }
    }
  }
  return { oldRelativePath: issue.relativePath, newRelativePath };
}

export function assertIssueReady(issue: IssueDocument): void {
  if (issue.metadata.status === "closed" || issue.metadata.status === "cancelled") {
    throw new Error(`Issue ${issue.metadata.id} is ${issue.metadata.status} and cannot be started.`);
  }
  const intentSections = ["Background", "Scope", "Non-goals"];
  const hasIncompleteIntent = intentSections.some((heading) => !isMeaningful(issue.sections.get(heading) ?? ""));
  const acceptance = issue.sections.get("Acceptance Criteria") ?? "";
  if (hasIncompleteIntent || getTaskCheckboxes(acceptance).length === 0 || hasPlaceholder(acceptance)) {
    throw new Error(`Issue ${issue.metadata.id} is not ready: complete Background, Scope, Non-goals, and Acceptance Criteria first.`);
  }
}

export function assertIssueClosable(issue: IssueDocument): void {
  if (issue.metadata.status !== "in-progress") {
    throw new Error(`Issue ${issue.metadata.id} must be in-progress before it can be closed.`);
  }
  const contentError = getCloseContentError(issue.metadata.id, issue.sections);
  if (contentError) {
    throw new Error(contentError);
  }
}

function getCloseContentError(id: string, sections: Map<string, string>): string | undefined {
  const acceptance = sections.get("Acceptance Criteria") ?? "";
  const checkboxes = getTaskCheckboxes(acceptance);
  if (checkboxes.length === 0 || checkboxes.some((match) => match[1] === " ")) {
    return `Issue ${id} cannot close: every Acceptance Criteria item must be checked.`;
  }
  if (!isMeaningful(sections.get("Implementation") ?? "")) {
    return `Issue ${id} cannot close: Implementation must contain evidence.`;
  }
  if (!isMeaningful(sections.get("Verification") ?? "")) {
    return `Issue ${id} cannot close: Verification must contain evidence.`;
  }
  return undefined;
}

export async function attachIssueFiles(
  issue: IssueDocument,
  filePaths: string[],
  dryRun = false
): Promise<{ relativePaths: string[] }> {
  if (filePaths.length === 0) {
    throw new Error("Issue attach requires at least one file path.");
  }
  for (const filePath of filePaths) {
    const source = await stat(filePath).catch((error: unknown) => {
      if (isMissingPathError(error)) {
        throw new Error(`Attachment source not found: ${filePath}`);
      }
      throw error;
    });
    if (!source.isFile()) {
      throw new Error(`Attachment source is not a file: ${filePath}`);
    }
  }

  const id = issue.metadata.id;
  const issueDir = resolve(issue.absolutePath, "..");
  const archived = basename(issueDir) === "closed";
  const issueRoot = archived ? resolve(issueDir, "..") : issueDir;
  const assetsRoot = join(issueRoot, "assets", id);
  const relativePaths = filePaths.map((filePath) => `docs/issues/assets/${id}/${basename(filePath)}`);
  const links = filePaths.map((filePath) => {
    const name = basename(filePath);
    return `- [${name}](${encodeURI(`${archived ? "../" : ""}assets/${id}/${name}`)})`;
  });
  const body = addIssueAttachmentLinks(issue.body, links);
  const metadata = { ...issue.metadata, updated_at: new Date().toISOString() };

  if (!dryRun) {
    await mkdir(assetsRoot, { recursive: true });
    for (const filePath of filePaths) {
      await copyFile(filePath, join(assetsRoot, basename(filePath)));
    }
    await writeFile(issue.absolutePath, serializeIssueDocument(metadata, body), "utf8");
  }
  return { relativePaths };
}

export function addIssueAttachmentLinks(body: string, links: string[]): string {
  const visible = maskFencedCode(body);
  const fresh = [...new Set(links.filter((link) => !visible.includes(link)))];
  if (fresh.length === 0) {
    return body;
  }
  const attachments = /^## Attachments$/m.exec(visible);
  if (attachments && attachments.index !== undefined) {
    const sectionStart = attachments.index + attachments[0].length;
    const rest = body.slice(sectionStart);
    const visibleRest = visible.slice(sectionStart);
    const nextSection = /^## /m.exec(visibleRest);
    const sectionEnd = nextSection?.index !== undefined ? sectionStart + nextSection.index : body.length;
    const section = body.slice(sectionStart, sectionEnd).trim();
    const content = section ? `${section}\n${fresh.join("\n")}` : fresh.join("\n");
    return `${body.slice(0, sectionStart)}\n\n${content}\n\n${body.slice(sectionEnd).trimStart()}`;
  }
  const relatedAdrs = /^## Related ADRs$/m.exec(visible);
  if (!relatedAdrs || relatedAdrs.index === undefined) {
    throw new Error("Issue document has no Related ADRs section.");
  }
  const section = `## Attachments\n\n${fresh.join("\n")}\n\n`;
  return `${body.slice(0, relatedAdrs.index)}${section}${body.slice(relatedAdrs.index)}`;
}

export function addCancellationSection(body: string, reason: string) {
  assertSingleLine(reason, "Issue cancellation reason");
  const cancellation = `## Cancellation\n\nReason: ${reason}\n\n`;
  const relatedAdrs = /^## Related ADRs$/m.exec(maskFencedCode(body));
  if (!relatedAdrs || relatedAdrs.index === undefined) {
    throw new Error("Issue document has no Related ADRs section.");
  }
  return `${body.slice(0, relatedAdrs.index)}${cancellation}${body.slice(relatedAdrs.index)}`;
}

export function serializeIssueDocument(metadata: IssueMetadata, body: string): string {
  return `---\n${stringify(metadata, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

function createInitialIssueMetadata(section?: string): Omit<IssueMetadata, "id"> {
  if (section !== undefined) {
    assertSingleLine(section, "Issue design section");
    if (!section.trim()) {
      throw new Error("Issue design section must not be empty.");
    }
  }
  const now = new Date().toISOString();
  return {
    status: "open",
    created_at: now,
    updated_at: now,
    priority: "medium",
    labels: [],
    parent: null,
    blocked_by: [],
    ...(section ? { design_section: section } : {})
  };
}

function createIssueBody(title: string): string {
  return [
    `# ${title}`,
    "",
    "## Background",
    "",
    "TODO",
    "",
    "## Scope",
    "",
    "- TODO",
    "",
    "## Non-goals",
    "",
    "- None.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] TODO",
    "",
    "## Implementation",
    "",
    "<!-- Complete after implementation. -->",
    "",
    "## Verification",
    "",
    "<!-- Add commands and results after verification. -->",
    "",
    "## Related ADRs",
    "",
    "- None."
  ].join("\n");
}

interface ParsedIssueResult {
  relativePath: string;
  issue?: IssueDocument;
  errors: string[];
}

async function readIssueDocuments(root: string): Promise<ParsedIssueResult[]> {
  const paths = await getIssueFilePaths(root);
  const results = await Promise.all(paths.map(async (path) => {
    const relativePath = `docs/issues/${path}`;
    const absolutePath = join(root, relativePath);
    const content = await readFile(absolutePath, "utf8");
    return parseIssueContent(absolutePath, relativePath, content);
  }));
  const issueIds = new Set(results.flatMap((result) => result.issue ? [result.issue.metadata.id] : []));
  for (const result of results) {
    if (!result.issue) {
      continue;
    }
    const { parent, blocked_by } = result.issue.metadata;
    if (typeof parent === "string" && !issueIds.has(parent)) {
      result.errors.push(`${result.relativePath}: parent references unknown Issue ${parent}.`);
    }
    for (const blocker of Array.isArray(blocked_by) ? blocked_by : []) {
      if (typeof blocker === "string" && !issueIds.has(blocker)) {
        result.errors.push(`${result.relativePath}: blocked_by references unknown Issue ${blocker}.`);
      }
    }
  }
  return [...results, ...(await readIssueAssetEntries(root, issueIds))];
}

async function readIssueAssetEntries(root: string, issueIds: ReadonlySet<string>): Promise<ParsedIssueResult[]> {
  let entries;
  try {
    entries = await readdir(join(root, "docs", "issues", "assets"), { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
  const results: ParsedIssueResult[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `docs/issues/assets/${entry.name}`;
    if (!entry.isDirectory() || !/^[0-9a-f]{5}$/.test(entry.name)) {
      results.push({
        relativePath,
        errors: [`${relativePath}: assets entries must be directories named by a five-character Issue ID.`]
      });
    } else if (!issueIds.has(entry.name)) {
      results.push({
        relativePath,
        errors: [`${relativePath}: no Issue with id ${entry.name} exists.`]
      });
    }
  }
  return results;
}

async function getIssueFilePaths(root: string): Promise<string[]> {
  const flat = await listIssueMarkdownFiles(join(root, "docs", "issues"));
  const archived = (await listIssueMarkdownFiles(join(root, "docs", "issues", "closed")))
    .map((name) => `closed/${name}`);
  return [...flat, ...archived].sort();
}

async function listIssueMarkdownFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

function parseIssueContent(absolutePath: string, relativePath: string, content: string): ParsedIssueResult {
  const errors: string[] = [];
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(content);
  if (!frontMatter) {
    return { relativePath, errors: [`${relativePath}: missing YAML Front Matter.`] };
  }

  const yamlDocument = parseDocument(frontMatter[1], { uniqueKeys: true });
  if (yamlDocument.errors.length > 0) {
    return { relativePath, errors: yamlDocument.errors.map((error) => `${relativePath}: invalid YAML Front Matter: ${error.message}`) };
  }
  let value: unknown;
  try {
    value = yamlDocument.toJS({ maxAliasCount: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { relativePath, errors: [`${relativePath}: invalid YAML Front Matter: ${message}`] };
  }
  if (!isRecord(value)) {
    return { relativePath, errors: [`${relativePath}: YAML Front Matter must be a mapping.`] };
  }

  const metadata = value as unknown as IssueMetadata;
  const body = frontMatter[2].trim();
  const fenceWalk = walkFencedCode(body);
  if (fenceWalk.unclosedFenceLine !== undefined) {
    const contentLine = content.slice(0, content.indexOf(body)).split(/\r?\n/).length - 1 + fenceWalk.unclosedFenceLine;
    errors.push(`${relativePath}: unclosed fenced code block opened at line ${contentLine}; nested fences require a longer outer fence (for example four backticks).`);
  }
  const visibleBody = fenceWalk.masked;
  const titleMatches = [...visibleBody.matchAll(/^# (.+)$/gm)];
  const title = titleMatches[0]?.[1]?.trim() ?? "";
  const sectionMatches = [...visibleBody.matchAll(/^## (.+)$/gm)];
  const sectionHeadings = sectionMatches.map((match) => match[1].trim());
  const sections = parseSections(body, sectionMatches);
  const fileMatch = ISSUE_FILE_PATTERN.exec(basename(relativePath));

  if (!fileMatch) {
    errors.push(`${relativePath}: filename must match <five-hex-id>-<title-slug>.md.`);
  }
  if (typeof metadata.id !== "string" || !/^[0-9a-f]{5}$/.test(metadata.id)) {
    errors.push(`${relativePath}: front matter id must be five lowercase hexadecimal characters.`);
  } else if (fileMatch && metadata.id !== fileMatch[1]) {
    errors.push(`${relativePath}: front matter id must match the filename id ${fileMatch[1]}.`);
  }
  if (!ISSUE_STATUSES.has(metadata.status)) {
    errors.push(`${relativePath}: status must be open, in-progress, closed, or cancelled.`);
  }
  if (metadata.priority !== undefined && (typeof metadata.priority !== "string" || !ISSUE_PRIORITIES.has(metadata.priority))) {
    errors.push(`${relativePath}: priority must be critical, high, medium, or low.`);
  }
  if (metadata.labels !== undefined && (!Array.isArray(metadata.labels) || metadata.labels.some((label) => typeof label !== "string"))) {
    errors.push(`${relativePath}: labels must be an array of strings.`);
  }
  if (metadata.parent !== undefined && metadata.parent !== null && (typeof metadata.parent !== "string" || !/^[0-9a-f]{5}$/.test(metadata.parent))) {
    errors.push(`${relativePath}: parent must be null or a five-character Issue ID.`);
  }
  if (metadata.blocked_by !== undefined && (!Array.isArray(metadata.blocked_by) || metadata.blocked_by.some((blocker) => typeof blocker !== "string" || !/^[0-9a-f]{5}$/.test(blocker)))) {
    errors.push(`${relativePath}: blocked_by must be an array of five-character Issue IDs.`);
  }
  for (const key of Object.keys(value)) {
    if (!METADATA_KEYS.has(key)) {
      errors.push(`${relativePath}: unsupported front matter field ${key}.`);
    }
  }
  for (const key of ["created_at", "updated_at"] as const) {
    if (!isTimestamp(metadata[key])) {
      errors.push(`${relativePath}: ${key} must be an ISO timestamp string.`);
    }
  }
  if ((metadata.status === "in-progress" || metadata.status === "closed") && !isTimestamp(metadata.started_at)) {
    errors.push(`${relativePath}: ${metadata.status} Issue requires started_at.`);
  }
  if (metadata.status === "closed" && !isTimestamp(metadata.closed_at)) {
    errors.push(`${relativePath}: closed Issue requires closed_at.`);
  }
  if (metadata.status === "cancelled" && !isTimestamp(metadata.cancelled_at)) {
    errors.push(`${relativePath}: cancelled Issue requires cancelled_at.`);
  }
  const fenceClosed = fenceWalk.unclosedFenceLine === undefined;
  if (fenceClosed && (titleMatches.length !== 1 || !title)) {
    errors.push(`${relativePath}: document must contain exactly one non-empty H1 title.`);
  } else if (fenceClosed && fileMatch) {
    try {
      if (fileMatch[2] !== slugifyIssueTitle(title)) {
        errors.push(`${relativePath}: filename slug must match the H1 title.`);
      }
    } catch (error) {
      errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (fenceClosed) {
    for (const heading of REQUIRED_SECTIONS) {
      const count = sectionHeadings.filter((candidate) => candidate === heading).length;
      if (count === 0) {
        errors.push(`${relativePath}: missing required section ## ${heading}.`);
      } else if (count > 1) {
        errors.push(`${relativePath}: section ## ${heading} must appear exactly once.`);
      }
    }
    for (const heading of sectionHeadings) {
      if (!REQUIRED_SECTIONS.includes(heading) && heading !== "Cancellation" && heading !== "Attachments") {
        errors.push(`${relativePath}: unsupported section ## ${heading}.`);
      }
    }
    const requiredIndexes = REQUIRED_SECTIONS.map((heading) => [...sections.keys()].indexOf(heading));
    if (requiredIndexes.every((index) => index >= 0) && requiredIndexes.some((index, position) => position > 0 && index < requiredIndexes[position - 1])) {
      errors.push(`${relativePath}: required sections are out of order.`);
    }
  }
  if (metadata.status === "closed") {
    const contentError = getCloseContentError(metadata.id, sections);
    if (contentError) {
      errors.push(`${relativePath}: ${contentError}`);
    }
  }
  if (metadata.status === "cancelled" && !isMeaningful(sections.get("Cancellation") ?? "")) {
    errors.push(`${relativePath}: cancelled Issue requires a non-empty ## Cancellation section.`);
  }

  return {
    relativePath,
    issue: {
      absolutePath,
      relativePath,
      metadata,
      title,
      body,
      content,
      sections
    },
    errors
  };
}

function collectIssueErrors(results: ParsedIssueResult[]): string[] {
  const errors = results.flatMap((result) => result.errors);
  const pathsById = new Map<string, string[]>();
  for (const result of results) {
    const id = result.issue?.metadata.id;
    if (typeof id === "string" && /^[0-9a-f]{5}$/.test(id)) {
      pathsById.set(id, [...(pathsById.get(id) ?? []), result.relativePath]);
    }
  }
  for (const [id, paths] of pathsById) {
    if (paths.length > 1) {
      errors.push(`duplicate Issue id ${id}: ${paths.join(", ")}.`);
    }
  }
  return errors;
}

function parseSections(body: string, matches: RegExpMatchArray[]): Map<string, string> {
  const sections = new Map<string, string>();
  for (const [index, match] of matches.entries()) {
    const heading = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    if (!sections.has(heading)) {
      sections.set(heading, body.slice(start, end).trim());
    }
  }
  return sections;
}

function getTaskCheckboxes(markdown: string): RegExpMatchArray[] {
  return [...maskFencedCode(markdown).matchAll(/^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]+\S.*$/gm)];
}

interface FenceWalkResult {
  masked: string;
  unclosedFenceLine: number | undefined;
}

function walkFencedCode(markdown: string): FenceWalkResult {
  let fence: { character: string; length: number; line: number } | undefined;
  let lineNumber = 0;
  const masked = markdown.replace(/^.*$/gm, (line) => {
    lineNumber += 1;
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (closing?.[0] === fence.character && closing.length >= fence.length) {
        fence = undefined;
      }
      return " ".repeat(line.length);
    }

    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (opening) {
      fence = { character: opening[0], length: opening.length, line: lineNumber };
      return " ".repeat(line.length);
    }
    return line;
  });
  return { masked, unclosedFenceLine: fence?.line };
}

function maskFencedCode(markdown: string): string {
  return walkFencedCode(markdown).masked;
}

function isMeaningful(content: string): boolean {
  const visible = maskMarkdownCode(content.replace(/<!--[\s\S]*?-->/g, "")).trim();
  return Boolean(visible && !hasPlaceholder(visible));
}

function hasPlaceholder(markdown: string): boolean {
  const visible = maskMarkdownCode(markdown);
  return /^[ \t]*(?:[-*+][ \t]+)?(?:\[[ xX]\][ \t]+)?(?:TODO|Pending)(?:[ \t]*[.:：-][^\r\n]*)?[ \t]*$/m.test(visible);
}

function maskMarkdownCode(markdown: string): string {
  return maskFencedCode(markdown).replace(/^.*$/gm, maskInlineCode);
}

function maskInlineCode(line: string): string {
  const characters = [...line];
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] !== "`" || characters[index - 1] === "\\") {
      continue;
    }
    let delimiterLength = 1;
    while (characters[index + delimiterLength] === "`") {
      delimiterLength += 1;
    }
    const delimiter = "`".repeat(delimiterLength);
    const rest = characters.slice(index + delimiterLength).join("");
    let relativeClosing = rest.indexOf(delimiter);
    while (relativeClosing >= 0 && rest[relativeClosing + delimiterLength] === "`") {
      relativeClosing = rest.indexOf(delimiter, relativeClosing + delimiterLength);
    }
    if (relativeClosing < 0) {
      index += delimiterLength - 1;
      continue;
    }
    const closingEnd = index + delimiterLength + relativeClosing + delimiterLength;
    characters.fill(" ", index, closingEnd);
    index = closingEnd - 1;
  }
  return characters.join("");
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function assertSingleLine(value: string, label: string): void {
  if (/[\r\n\u2028\u2029]/u.test(value)) {
    throw new Error(`${label} must be a single line.`);
  }
}

function assertIssueId(id: string): void {
  if (!/^[0-9a-f]{5}$/.test(id)) {
    throw new Error(`Issue ID must be five lowercase hexadecimal characters: ${id}`);
  }
}

function toIssueSummary(issue: IssueDocument): IssueSummary {
  return {
    id: issue.metadata.id,
    status: issue.metadata.status,
    title: issue.title,
    relativePath: issue.relativePath
  };
}
