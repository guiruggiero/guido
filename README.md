# GuiDo

Just like [Guimail](https://github.com/guiruggiero/guimail), but for WhatsApp

## TODOs

- `src/llmCaller.js` (`callLLMTraced`, the `time` prompt variable passed to `getGuiDoPrompt`, ~line 238): get the time zone at runtime instead of hardcoding `America/Los_Angeles`
- `src/messageHandler.js` (`getMedia`, "Validate file size" block, ~line 54): the `arrayBuffer.byteLength` check below the `content-length` one may be redundant for the trusted Vonage CDN
- `src/messageHandler.js` (`getMedia`, "Save in local folder" block, ~line 69): upload media to Google Cloud Storage instead of saving it locally
- `references/message.jsonc` (`media.understanding`, ~line 17): figure out how to extract it