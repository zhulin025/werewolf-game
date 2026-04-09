require('dotenv').config();
const llmService = require('./server/llm/LLMService');

async function testLLM() {
    console.log('Testing LLM with:', llmService.model);
    console.log('Base URL:', llmService.baseUrl);
    try {
        const res = await llmService.call('You are a helpful assistant.', 'Say hi in 5 words.');
        console.log('Success!', res);
    } catch (err) {
        console.error('LLM Test Failed:', err.message);
    }
}

testLLM();
