package main

import "context"

// App is the native host for PurpleCommand. TeamServer communication remains
// in the web interface for now; this type provides a stable place for future
// operating-system integrations and native Wails bindings.
type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (app *App) startup(ctx context.Context) {
	app.ctx = ctx
}
