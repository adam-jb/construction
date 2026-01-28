
Preprocessing:
- Make embeddings
- Make knowledge graph of entities and relationships
- Make mapping of chunks to entities
- Create document page number / chapter / section index. So if LLM (at query) realises it needs to go to that section, it can jump to that section (one way of implementing this is as a ‘find section to jump to’ tool where it puts in the chapter / book / section to jump to, and it is taken right there). May help to map these to the knowledge graph

Knowledge graph can be imperfect: it saves the LLM from having to decide itself for some references, by mechanistically finding links in the chain of what needs to be known

Query time algorithm:                                                                                                                                                                                                                           
                                                   
0. Decompose query into subquestions as needed                                                                                                                                                                                                  
  1. Parse query → concepts                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                     
  2. Search (parallel):                                                                                                                                                                                                                              
     ├── BM25 or pure keyword search on chunks → chunk IDs                                                                                                                                                                                                                  
     ├── Embedding search on chunks → chunk IDs                                                                                                                                                                                                      
     └── Graph lookup on entities → entity IDs                                                                                                                                                                                                       
                                                                                                                                                                                                                                                     
  3. Map to entry nodes:                                                                                                                                                                                                                             
     └── chunk IDs → (via mapping table) → entity IDs                                                                                                                                                                                                
     └── union with direct graph lookup results                                                                                                                                                                                                      
                                                                                                                                                                                                                                                     
  4. Traverse graph from entry entities                                                                                                                                                                                                              
     └── → reached entity IDs                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                     
  5. Map back to text:                                                                                                                                                                                                                               
     └── reached entity IDs → (via mapping table) → chunk IDs                                                                                                                                                                                        
                                                                                                                                                                                                                                                     
  6. LLM reviews chunks:                                                                                                                                                                                                                             
     ├── Filter irrelevant (reduce noise)                                                                                                                                                                                                            
     ├── Extract any references in text not yet followed                                                                                                                                                                                             
     └── Judge: "Do I have enough to answer the query?"                                                                                                                                                                                              
                                                                                                                                                                                                                                                     
  7. If references found OR incomplete:                                                                                                                                                                                                              
     └── For each unfollowed reference:                                                                                                                                                                                                              
         ├── Search for that specific reference using document page number / section / chapter index. The LLM should have option of also looking for chunks / tables / charts / etc before or after it relative to the chunk being considered (eg if text says ‘see above’). Retrieve these chunks                                                                                                                                                                    
         ├── Add new chunks                                                                                                                                                                                                                          
         └── Loop back to step 6                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                     
  8. Return final chunks as formatted answer   



Examples for testing this
“Do I need to apply snow loading onto my structure? What steps would I need to take to check this and what part of the code should I refer to?”
Doc to use: en.1991.1.3.2003_snow_loads.pdf

“I am busy designing a bridge in London UK. Should I be considering potential issues regarding fire damage to my structure?”
Doc to use: en.1991.1.2.2002_fire.pdf

