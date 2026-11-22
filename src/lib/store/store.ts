// What every store operation needs (ADR-0017): the project folder, the user config folder (settings and secrets,
// never inside the project: ADR-0011) and a clock. Documents, versions and traceability are read from the files and
// git; there is no database.
export interface Store {
  root: string;
  user: string;
  now?: () => Date;
}
