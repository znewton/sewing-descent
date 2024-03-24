echo "Downloading fonts..."

mkdir -p tmp
(
    cd tmp
    curl "https://dl.dafont.com/dl/?f=punkboy" -L -o punkboy.zip
    unzip punkboy.zip
)
mkdir -p static
cp tmp/punkboy_tbs.ttf static/punkboy.ttf

rm -rf tmp

echo "Installing dependencies..."

npm install

echo "Setup complete!"