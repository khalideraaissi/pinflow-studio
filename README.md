# Pinflow Studio

‏PROJECT: Simple Pinterest CSV to Buffer Automation Tool

‏Build a simple, modern, fully functional web application that automatically converts Excel and CSV rows into Pinterest Pins and sends them directly to Buffer for scheduled publishing.

1. ‏Core Concept

‏The application must have one simple workflow:

‏Upload Excel/CSV → Read Data → Generate Images → Create Pinterest Pins → Send to Buffer Queue.

‏Do not build a complicated SaaS platform.

‏Do not include unnecessary features such as advanced analytics, subscriptions, team management, or complex automation systems.

‏Focus entirely on importing content, generating images, and sending Pins to Buffer.

1. ‏Excel / CSV Import

‏Create a simple upload interface supporting:

‏CSV files.

‏Excel XLSX files.

‏The spreadsheet must contain these columns:

‏title

‏description

‏tags

‏image_prompt

‏article_url

‏After uploading:

‏Read all rows automatically.

‏Display the imported data in a table.

‏Show the total number of rows.

‏Validate required fields.

‏Allow users to edit individual rows.

‏Allow users to delete rows.

‏Allow users to select which rows to process.

‏Do not require users to manually rewrite their spreadsheet data.

1. ‏AI Image Generation

‏Use the image_prompt column to generate one image for each row.

‏Requirements:

‏Generate one unique image per row.

‏Use a vertical Pinterest format (1000 × 1500 pixels).

‏Save generated images to cloud storage.

‏Associate each image with its corresponding spreadsheet row.

‏Display an image preview.

‏Allow image regeneration.

‏Allow image download.

‏Do not generate new titles or descriptions. Use the exact content provided in the spreadsheet unless the user edits it.

1. ‏Pinterest Pin Creation

‏For each row, create a Pinterest Pin containing:

‏Generated image.

‏Title from the title column.

‏Description from the description column.

‏Article URL from the article_url column.

‏Tags from the tags column.

‏Pinterest does not provide a universal native tags field for Pin creation. Preserve tags in the application and optionally append them as relevant hashtags to the description.

‏Allow the user to select a Pinterest board from the boards available through the connected Buffer Pinterest channel.

‏The user can choose one default board for all imported Pins or assign different boards to individual rows.

1. ‏Buffer Integration

‏This is the most important integration.

‏Connect to Buffer using its official API.

‏Settings must include:

‏Buffer API key.

‏Connection test.

‏Connected organizations.

‏Connected Pinterest channels.

‏Available Pinterest boards.

‏After connecting, automatically retrieve the available Pinterest channels and their boards.

‏Publishing Workflow

‏When the user clicks Send to Buffer:

‏Take the first selected spreadsheet row.

‏Generate its image.

‏Upload the image to cloud storage.

‏Create the Pinterest post using Buffer's official GraphQL API.

‏Include the generated image.

‏Include the title.

‏Include the description.

‏Include the article URL.

‏Assign the selected Pinterest board using Buffer's supported Pinterest metadata.

‏Add the post to the Buffer queue.

‏Save the Buffer post ID and status.

‏Move to the next selected row.

‏Repeat until all selected rows have been processed.

‏Important: Use Buffer's Add to Queue functionality. Do not publish Pins immediately. Buffer must publish them later according to the connected Pinterest channel's existing publishing schedule.

1. ‏Simple Dashboard

‏Create only one main dashboard with these sections:

‏Upload Spreadsheet

‏A drag-and-drop CSV/XLSX upload area.

‏Imported Posts

‏A table displaying:

‏Checkbox.

‏Title.

‏Description.

‏Image prompt.

‏Generated image preview.

‏Article URL.

‏Selected board.

‏Status.

‏Action Buttons

‏Generate All Images.

‏Preview Pins.

‏Send Selected to Buffer.

‏Send All to Buffer.

‏Retry Failed Rows.

‏Download Results CSV.

‏Processing Status

‏Show the status of every row:

‏Pending.

‏Generating Image.

‏Image Ready.

‏Sending to Buffer.

‏Added to Buffer.

‏Failed.

‏Display a progress bar showing completed rows and remaining rows.

‏Prevent duplicate submissions.

1. ‏Simple Settings

‏Create a small settings page containing only:

‏Buffer Settings

‏API key.

‏Connection status.

‏Pinterest channel selection.

‏Pinterest board selection.

‏AI Image Settings

‏Image generation provider.

‏API key.

‏Image generation model.

‏Image Settings

‏Default dimensions: 1000 × 1500.

‏Image format: PNG or JPEG.

‏Storage Settings

‏Cloud image storage credentials.

1. ‏Technical Requirements

‏Build a lightweight application.

‏Suggested stack:

‏Frontend: React + TypeScript + Tailwind CSS.

‏Backend: Node.js + TypeScript.

‏Database: SQLite for a simple single-user deployment, or PostgreSQL for hosted deployments.

‏Image storage: S3-compatible cloud storage.

‏Excel parsing: ExcelJS or SheetJS.

‏Buffer integration: Official Buffer GraphQL API.

‏AI images: Configurable image generation API.

‏Keep all API keys on the backend.

‏Use background processing for image generation and Buffer submissions so large spreadsheets do not cause request timeouts.

‏Implement automatic retries for temporary API errors.

‏Preserve the imported spreadsheet and processing results so users can return to unfinished batches.

1. ‏Final User Experience

‏The application should be extremely simple:

‏Open the application.

‏Upload an Excel or CSV file.

‏Select the Pinterest channel.

‏Select the Pinterest board.

‏Click Generate Images.

‏Preview the generated Pins.

‏Click Send All to Buffer.

‏The application sends all Pins to the Buffer queue.

‏Buffer publishes them according to its configured schedule.

‏FINAL INSTRUCTION

‏Build exactly this tool.

‏Keep the interface minimal, the workflow fast, and the integrations reliable.

‏Do not add features that are not required for the CSV-to-Buffer publishing workflow.

‏title description tags image_prompt article_url

‏The most important objective is to process spreadsheet rows automatically, generate the corresponding images, and successfully add complete Pinterest Pins to the Buffer queue

‏

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3c0bffd5-0a61-4da2-823e-c921bb0db2fd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
