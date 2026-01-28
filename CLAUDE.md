
For the system you make: make it as simple as possible without compromising on functionality or performance. Simplicity is valuable.

The system you are making: will search documents of design codes (construction sector) to ensure that for a given query, all the relevant info is surfaced. It is often that case that the info which is surfaced in one search will refer to other documents, and that section of the relevant document will need to be found too, either via a search or use of an index or something else. 

Every building being built is different and so the codes need to be consulted each time for applicability and referencing of tables and figures. 

As a simple example:
1. one would need to find the factors of safety for dead loads for a concrete bridge, then look for the density to be used for your vertical loading assuming a specific percentage of reinforcement within the concrete.
2. The answer you are looking for is:
- Table showing factors of safety for various load combinations.
- ⁠Clauses showing how to calculate the factor of safety for dead loads.
- ⁠Table showing concrete densities to use for working out the actual load.


Companies will have their PDF collection we include. All files in ‘pdfs’ are the examples we provide. The real company (client for this system) will upload a bunch of their own.

If don’t find enough detail, ie too vague, you might look for more info. The AI / search agent will need to judge when it has enough info and when it will need to continue the search, and what to do (if shouldn’t do things it’s already done)

A given question should return (after searching and completing all ‘chains’ of documents which refer to other docs which refer to other docs, etc):
- Page locations; elements of pages or words as markdown which can be rendered (render it by default for testing)

