import fs from "node:fs";
import {setTimeout as pause} from "node:timers/promises";

export async function recordDemo(browser,url){
 const context=await browser.newContext({viewport:{width:1366,height:860},recordVideo:{dir:".local/demo",size:{width:1366,height:860}}});
 const page=await context.newPage();
 const video=page.video();
 try{
  await page.goto(url);await page.locator('.stat.lead strong').waitFor();await pause(1200);
  await page.getByRole('button',{name:'Growth Copilot'}).click();
  const ask=async question=>{
   await page.getByLabel('Copilot question').fill(question);await pause(650);
   const completed=page.waitForResponse(r=>r.url().endsWith('/api/copilot'));
   await page.getByLabel('Send question').click();const response=await completed;if(!response.ok())throw Error(await response.text());
   await page.locator('.turn .answer').last().waitFor();await pause(1800);
  };
  await ask('Which campaigns are underperforming and why?');
  await ask('What should we do?');
  await ask('Create a task for Arjun to cut Creator Partners spend by Friday');
  await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByText('Saved to task manager').waitFor();await pause(1100);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('nav').getByRole('button',{name:'Task manager'}).click();
  await page.locator('.task').filter({hasText:'Creator Partners'}).waitFor();await pause(1700);
  await page.locator('nav').getByRole('button',{name:'Overview'}).click();await page.locator('.actionRow').first().scrollIntoViewIfNeeded();await pause(1500);
 }finally{await context.close();}
 fs.mkdirSync('demo',{recursive:true});await video.saveAs('demo/growth-center.webm');
 console.log('Recorded demo/growth-center.webm');
}

