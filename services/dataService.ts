
import { Project, ProjectStatus, ProjectAnalysis, RotLevel } from '../types';

const SPREADSHEET_ID = '1r2Gr_t_aGKSayoNCoYRHWnEgTdZZ2LcAHoi3MpgZiCg';
const SHEET_NAME = 'Project Index';

// Helper to safely parse dates from loose string formats
const safeParseDate = (dateStr: string | undefined): string => {
  if (!dateStr) return new Date().toISOString();
  
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  
  return parsed.toISOString();
};

export const fetchProjects = async (): Promise<Project[]> => {
  try {
    const range = `'${SHEET_NAME}'!A2:G`; 

    const response = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range, 
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = response.result.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row: string[], index: number) => {
      const id = (index + 2).toString();
      let statusRaw = row[3];
      if (statusRaw === 'Archive 🗄️') statusRaw = ProjectStatus.ARCHIVED;

      return {
        id: id,
        name: row[0] || 'Untitled Project',
        links: row[1] || 'No Link',
        lastTouched: safeParseDate(row[2]),
        status: (statusRaw as ProjectStatus) || ProjectStatus.NEW,
        owner: row[4] || '',
        tags: row[6] || '',
      };
    });
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    throw new Error("Failed to fetch data from Google Sheets");
  }
};

/**
 * Perform a fuzzy search across the entire spreadsheet for the AI tool
 */
export const searchProjectsInSheet = async (query: string): Promise<any[]> => {
  try {
    const allProjects = await fetchProjects();
    const q = query.toLowerCase().trim();
    
    // Simple fuzzy match across multiple fields
    return allProjects.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.owner?.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q) ||
      p.tags.toLowerCase().includes(q)
    ).map(p => ({
      name: p.name,
      status: p.status,
      lastTouched: p.lastTouched,
      owner: p.owner,
      tags: p.tags
    }));
  } catch (error) {
    console.error("Tool search error:", error);
    return [];
  }
};

export const updateProjectStatus = async (id: string, newStatus: ProjectStatus): Promise<void> => {
    try {
        const range = `'${SHEET_NAME}'!C${id}:D${id}`;
        const now = new Date().toISOString();
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[now, newStatus]] }
        });
    } catch (error: any) {
        throw new Error("Failed to update status in Google Sheets");
    }
};

export const updateProjectDetails = async (id: string, updates: { name: string, links: string, tags: string, owner: string }): Promise<void> => {
  try {
    const data = [
      { range: `'${SHEET_NAME}'!A${id}:B${id}`, values: [[updates.name, updates.links]] },
      { range: `'${SHEET_NAME}'!E${id}`, values: [[updates.owner]] },
      { range: `'${SHEET_NAME}'!G${id}`, values: [[updates.tags]] }
    ];
    await window.gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: { valueInputOption: 'USER_ENTERED', data: data }
    });
  } catch (error: any) {
    throw new Error("Failed to update project details");
  }
};

export const createProject = async (project: { name: string, links: string, tags: string, owner: string }): Promise<void> => {
  try {
    const range = `'${SHEET_NAME}'!A:G`;
    const now = new Date().toISOString();
    const rowData = [project.name, project.links, now, ProjectStatus.NEW, project.owner, "", project.tags];
    await window.gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [rowData] }
    });
  } catch (error: any) {
    throw new Error("Failed to create project in Google Sheets");
  }
};

export const calculateRot = (lastTouched: string): { days: number, level: RotLevel } => {
  const touchDate = new Date(lastTouched);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - touchDate.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  let level = RotLevel.FRESH;
  if (diffDays > 10) level = RotLevel.ABANDONED;
  else if (diffDays > 5) level = RotLevel.NEGLECTED;
  return { days: diffDays, level };
};

export const analyzeProjects = (projects: Project[]): ProjectAnalysis[] => {
  return projects.map(p => {
    const { days, level } = calculateRot(p.lastTouched);
    return { project: p, daysSinceTouch: days, rotLevel: level };
  });
};
