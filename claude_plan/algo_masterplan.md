
Principles: to make the system as simple as possible and push the thinking to the AI as much as possible. That’s much better than getting me to pre-empt everything which might come up 


.env includes
GEMINI_API_KEY
PINECONE_API_KEY
R2_API_URL



## Data stores

Section are mapped to by their document name and section code, inc the table, equation or figure name (or other type of class as they are found). In addition to their contents, their page number from the pdf is also stored, and any precedence which applies to the section (eg if other codes supersede or fall below these)

We store, for each section:

A lookup of the section identifier to it’s content

Chunks with embeddings, for RAG. 


A map to every other section, formula and other object it refers to. 


Lookup of section identifier to any precedence rules which apply to it, and where that came from

For all the above, the keys would be a concatenation of the doc publisher + doc code + section code, so the correct names of docs to is important to get perfect and perfectly consistent (which is why the master list of doc names is super important). For RAG, the chunk will include the text itself and the metadata which is the key.


We also store the following, which the AI can edit:
A key/value store which can look things up, and include different permutations of things for redundancy. This includes mappings of symbols to names, parameters to values, etc. The AI can check if things are there already, and if there are conflicts. 


Master list of documents referenced, including those not yet uploaded, in case they can be referred to later 


A ‘formulae store’. We can store things like formulae in both the ‘section chunk’ and the formulae store. Key is a concatenation of doc publisher + doc code + formula code


‘Other object store’ which includes figures and tables. The images and tables can be in a local or cloud file system, with the ‘value’ in this dictionary being the path to them. Key is a concatenation of doc publisher + doc code + object code (eg ‘figure_5.1’)
In short, our datastores are a bunch of dictionaries. We don’t need a graph db.


There are cases when something is referenced, but the references may not need to be followed for the query to be run. For these we might return the references as optional extra links for the user to choose to follow or not (subject to the AI thinking the section pointing to the reference is valuable) For example:
Fatigue due to the effects of wind actions should be considered for susceptible structures.
NOTE The number of load cycles may be obtained from Annex 8, C and E.
However for now, for simplicity, we will follow such references blindly

All concatenations of names should concatenate with underscores between each element.


IGNORE THIS FOR NOW, IT MAY BE ADDED TO IN A LATER EDITION, I DONT LIKE IT BECAUSE IT’S A SPECIFIC RULE AND WE WANT THIS TO BE AI DRIVEN: If someone looks for something which a whole chapter covers, eg ‘roofs’, then maybe we want the model to pick up on this and suggest they read the whole chapter. Could do this by extracting the chapter titles and names of larger sections. Might be making it more complicated though





## Ingesting and Parsing PDFs (ie creating and updating the datastore)

Test if the doc is already in the system, using the master list. If it’s not, we don’t need to ingest it.

There are images, tables, figures, text in the PDF. Some PDFs are 30 years old!

The aim of the parsing is to extract all the content from this doc and get it into the datastores specified.

To parse the PDFs, as the are old, you wont be able to do this with the PDF code itself. You’ll need, particularly for images, to identify the sections of the pages which are images, and crop them out as images, by identifying the bounding box somehow. In doing so you’ll need to extract the name and/or code and/or reference of the item, so that it can be stored in the ‘other object store’. I expect getting this right to be tricky. 

To identify references: 
Overall, doesn’t look like language varies much for references, eg ‘see X’, or ‘according to X’, or ‘are given in X’ (though don’t rely on knowing the exact phrasing in advance), ‘see also X’, ‘may be given in X’, ‘using X’
  For this want to tell our AI that things of the format 4.2.1 and such are likely to be references, though references may be denoted through other means too

Making the embeddings: after retrieving the images, tables and equations, write a description (based on what the LLM ‘sees’ - using vision function - and can read from the tables and equations, and also on what any elements which refer to the sections say - use the newly created references, though in reverse - ie look for sections which refer to the item - from all this create a description which can be made into embeddings). The descriptions can also be used in the keyword search, so the descriptions should be stored in the lookup of section identifier and its content.

Precedence: some sections’ codes supersede or fall below these from other rulemakers. We need to ingest this precedence. The precedence may well be in earlier sections of the doc, far from the section it relates to, so during the parsing keep a store of precedences, and then apply them to the relevant section when you come to that section. Section names should be standardised (eg X.Y.Z, or 4.3.1) so that a deterministic lookup can be used.
We need a time efficient and token efficient method for identifying the sections of the documents. The LLM is likely to be the most reliable way: by sending pages of PDFs through the LLM and asking for keywords to use to split the sections by.
Overall the ingestion and parsing process should be:
Read in PDF
For each page, find location of images and tables (including the title, caption, label, etc - and any other text which tells us what the image pertains to)
Extract all text
Split text into sections (using LLM) and store in lookup of the section identifier to it’s content.
Extract and create descriptions for images and other items, using LLM, inc feeding data text on the same page as the images or other items, as the contextual information might help create better descriptions for it
Extract and store references (uses LLM)
Create and store embeddings 
Create and store precedence (uses LLM)
Update the key/value store. LLM can can scan through to find all significant key/values, and add them to the store. 
Update all other data stores

One concern will be giving our budget LLM too many tasks at once. We shouldn’t ask it to do more than 10 things at once. I don’t think the above risks doing that, however it is using the LLM 5ish times, and each time will cover the whole PDF at least once, which will be a lot of tokens at scale.
Very fast parsing is needed: we’d ideally do all this in under 30 seconds. This includes getting images ingested very well. We favour a simpler approach to doing this, and using python, however if there are ways to speed it up significantly by using other languages, please tell us how.


## Querying

Step by step of how query will work in detail
LLM call to determine if the query can be answered with the current data in memory (ie from earlier in the conversation with the user, which would require some kind of ‘session’ data and might be better suited to the front end), or if a query is needed at all (eg if user just types ‘hello’), or whether to take their query and run it through.
Do RAG on the query, getting top 10 sections
Use LLM to extract keywords, and get all sections with any of the keywords. Because of this we want to not pick *too many* keywords. Use the kv store to check for equivalency on what is being searched for (eg acronyms, ‘aA = reduction factor’)
For each returned section, check relevance by ask LLM to return the elements which relate to the query (including contextual info which may be helpful). 
If the 2 least relevant chunks retrieved via vector search have any relevant info at all, retrieve the 10 next most pertinent sections according to the vector search. We take 2 chunks for this not one, to make sure we don’t accidentally miss anything (as some chunks won’t be relevant as embeddings are imperfect)
Do (3) again, to see what’s relevant, and then (4) and again. Do this until nothing relevant found according to the rule in (3).
For all sections for which at least something relevant was found, follow all their references to other sections.
Do (3) for all the new sections returned (2nd order references)
Do (6) and (7) for the 3rd order references.
If there are relevant 3rd order sections which have references, keep a list of the references but don’t follow the links (I’m tacitly assuming the references won’t be so useful, but we can still tell the user that the references exist in a summary at the end)
For the final list of sections which contribute content, check precedence using the precedence lookup
As equations are text so will be in the main chunks, I the formulae store can be excluded from the search. The tables will have their own descriptions so should be included in the search.
After running the query, the the AI should check for conflicts in what it returns. It doesn’t need to resolve them, but it should highlight them in the final output to the user.
The returned output should include all extracted text (only the extracted text, not the whole section), with references to the document and section code, and page number
What to return, depending on the API endpoints. Need to align this with Brighton’s spec

DONT NEED TO DO THIS FOR NOW In logs we should capture where references aren’t being found, so we can check if it’s because the doc isn’t uploaded or an error in inferring the doc names. Can also use this to know if a doc has already been uploaded + not preprocess again, or give the option to upload again and overwrite (useful if there’s a new version of the doc). 

IGNORE FOR NOW AS WE ARENT IMPLEMENTING AGENT CAPABILITY FOR NOW searching the kv store becomes a tool that the AI can use, if it gets more agent-like capability.




## Tech stack 

All keys for the below will be in a .env file

LLM: Gemini 2.5 flash lite. The idea is to see how we do with something fast and cheap. 

Datastores: use json file, which you read/write from, in Cloudflare R2

Cloudflare R2 files for images

Pinecone for embedding store and associated python library for search
  In Claude code run:  /plugin install pinecone

Gemini embeddings to create the embeddings. Use same API key as Gemini LLM

Code: all in python unless speed gains make it worth it to use something else; fastAPI




## System housekeeping

Have some automated test to comb through pdfs which are already uploaded and look for new classes of references which aren’t accounted for (eg something other than figures or formulae), to make sure we don’t miss anything










