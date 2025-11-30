You can use this command to debug and inspect the changes: 

```bash
make hot-reload 2>&1 | grep --line-buffered -E "Forge"
```

gsettings --schemadir ~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas set org.gnome.shell.extensions.forge logging-enabled true

gsettings --schemadir ~/.local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas set org.gnome.shell.extensions.forge log-level 7