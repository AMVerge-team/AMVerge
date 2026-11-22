{
  description = "AMVerge - High-performance anime and video scene cutter";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      version = "2.0.5";
      src = pkgs.fetchurl {
        url = "https://github.com/AMVerge-team/AMVerge/releases/download/v${version}/AMVerge_${version}_amd64.AppImage";
        sha256 = "sha256-4V/NPeYcj5c4n3Nca/PFRlzm7JZ6rQfOu40jDWrYctc=";
      };
      appimageContents = pkgs.appimageTools.extractType2 {
        pname = "amverge";
        inherit version src;
      };
    in
    {
      packages.${system}.default = pkgs.appimageTools.wrapType2 {
        pname = "amverge";
        inherit version src;

        extraInstallCommands = ''
          install -m 444 -D ${appimageContents}/*.desktop $out/share/applications/amverge.desktop
          substituteInPlace $out/share/applications/amverge.desktop \
            --replace-fail 'Exec=AMVerge' 'Exec=amverge'
          if [ -d "${appimageContents}/usr/share/icons" ]; then
            cp -r ${appimageContents}/usr/share/icons $out/share/
          fi
        '';

        meta = with pkgs.lib; {
          description = "High-performance anime and video scene cutter by Crptk, Moongetsu & team";
          homepage = "https://amverge.app";
          license = licenses.gpl3Only;
          platforms = [ "x86_64-linux" ];
          mainProgram = "amverge";
        };
      };

      apps.${system}.default = {
        type = "app";
        program = "${self.packages.${system}.default}/bin/amverge";
      };
    };
}
