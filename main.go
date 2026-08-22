package main

import (
	"embed"
	"fmt"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// The production Vite bundle is generated before Wails compiles this host.
//
//go:embed all:dist
var assets embed.FS

func main() {
	app := NewApp()
	err := wails.Run(&options.App{
		Title:                    "PurpleCommand",
		Width:                    1440,
		Height:                   900,
		MinWidth:                 1024,
		MinHeight:                640,
		AssetServer:              &assetserver.Options{Assets: assets},
		BackgroundColour:         options.NewRGB(18, 19, 21),
		EnableDefaultContextMenu: true,
		OnStartup:                app.startup,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		fmt.Printf("PurpleCommand failed to start: %v\n", err)
	}
}
