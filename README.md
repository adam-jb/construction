
# Design Code AI Assistant

A prototype UI demonstrating how an AI-assisted design code search tool works for the construction sector.

## Overview

This application helps engineers quickly find relevant information from design code documents by:
- **Semantic Search**: Find applicable clauses, tables, and figures across multiple documents
- **Reference Linking**: Follow cross-references between documents automatically
- **Source Tracing**: See exactly where information comes from with page and section details
- **Interactive Preview**: View highlighted sections in the document viewer as you search

## Features

- **Three-Pane Layout**: Sources, Chat/Reasoning, and Document Viewer
- **Document Collections**: Support for multiple PDF documents (codes, standards, references)
- **Collapsible Panes**: Customize the interface for your workflow
- **Markdown Rendering**: Formatted output with proper citations

## Project Structure

```
src/
├── components/
│   ├── Header.tsx
│   ├── ChatPane.tsx
│   ├── SourcesPane.tsx
│   └── DocumentViewer.tsx
├── hooks/
│   └── useTypewriter.ts
├── data/
│   └── mockData.ts
├── types.ts
├── App.tsx
└── main.tsx
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Notes

This is a frontend-only prototype. All data is loaded from local static JSON files.
