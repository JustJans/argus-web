# Translating the titles

Research of 24 September 2026. The question: which translator should give every title its
English and Spanish? It has to be:
- free;
- allowed by its terms;
- enough for our volume;
- light on the home server;
- able to handle Catalan, which the site may add one day.

## Before

Google's endpoint `translate.googleapis.com/translate_a` (client `gtx`), with MyMemory as the
spare. That endpoint is not a public API: it has no terms that cover this use. It shuts this
machine out from time to time: for days in September, and again on 24 September at 04:31.
When it does, MyMemory without an address answers 150 titles a build.

## What is on offer

| Translator | Free | Asks for | Catalan |
|---|---|---|---|
| Azure Translator, F0 tier | 2 million characters a month; it stops when they are spent, without charging | an Azure account; a card only to verify it | yes |
| MyMemory | 5,000 characters a day, or 50,000 with a contact address (`de`) | nothing, or an address | yes (tried) |
| Cloudflare Workers AI, `m2m100-1.2b` (Meta, MIT) | 10,000 neurons a day, about 13,000 titles | a Cloudflare account and a token | yes (101 languages) |
| DeepL API Free | 500,000 characters a month | an account | — |
| Opus-MT (University of Helsinki), in Node through `@huggingface/transformers` | no limit, on our server | the models on disk | no ready Catalan to Spanish |
| LibreTranslate / Argos Translate (AGPL) | no limit, on our server | a Python service and its models | yes |
| Firefox Translations (Mozilla, MPL-2.0) | no limit, on our server | `@browsermt/bergamot-translator` for Node, last published in 2022 | — |

More about each:
- **Azure.**
  - A request takes up to 1,000 texts and 50,000 characters.
  - The F0 tier allows 2 million characters an hour, "consumed evenly throughout the hour",
    that is about 33,300 a minute.
  - Each answer states the characters counted (`X-metered-usage`).
  - With no source language named, Azure detects it and says which.
  - Attribution is not required.
  - After the 30 days of the free account, the subscription must move to pay-as-you-go to stay
    active; the F0 tier stays free.
- **Opus-MT, tried on 40 live titles** from ten countries, with the one model that reads every
  language (`opus-mt-mul-en`) and then `opus-mt-en-es`:
  - about 35 of the 40 came out wrong: "Senior Manufacturing Engineer Innovatie" became "David
    David and his son Innovation", and "Automatiseringsingenieur" became "Automation Engine";
  - the models for one pair of languages would do better, but some thirty of them take
    several gigabytes, more than the project itself;
  - the library alone took 470 MB.

## Measured on our data

- **New titles.** About 7,900 new distinct titles a week (14 to 20 September), 43 characters
  each on average.
- **Two languages.** Into English and Spanish, at most about 2.9 million characters a month.
  - This is an upper bound: a title first seen that week may already have been in the cache.
- **Already in English.** 69% of the titles sent for English were already in English.
- **Skipping them.** Spanish is asked first, and Azure's detection lets the English pass skip
  those titles. That brings the bound down to about 2 million.
- **Backlog.** On 24 September, 6,197 titles still waited for their Spanish.

## Decision

The owner's decision (24 September 2026):
- **Azure Translator's F0 tier** is the translator.
- **MyMemory with a contact address** is the spare.
- **Google's endpoint goes** once Azure has been seen to work. Only two translators are kept.

Together they give about 3.5 million characters a month, which covers our volume.

If Catalan becomes a third language of the site, the need rises to about 3.5 million. The spare
would then be Cloudflare's `m2m100`.

## Sources

- Azure Translator:
  - service limits: https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits
  - pricing: https://azure.microsoft.com/en-us/pricing/details/translator/
  - creating the resource: https://learn.microsoft.com/en-us/azure/ai-services/translator/how-to/create-translator-resource
  - the Translate method: https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate
  - error codes: https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/status-response-codes
  - FAQ (attribution): https://learn.microsoft.com/en-us/azure/ai-services/translator/faq
- The Azure free account: https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account
- MyMemory usage limits: https://mymemory.translated.net/doc/usagelimits.php
- Cloudflare Workers AI:
  - pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
  - the model: https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/
- m2m100: https://huggingface.co/facebook/m2m100_1.2B
- DeepL API limits: https://developers.deepl.com/docs/resources/usage-limits
- LibreTranslate: https://github.com/LibreTranslate/LibreTranslate
- Firefox Translations: https://github.com/mozilla/translations
