"""Build using JDK 17, Android platform/build-tools 35 and the official RCSDK demo AARs."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZIP_DEFLATED
import argparse, os, subprocess

def run(*args):
    subprocess.run(list(map(str,args)),check=True)

def build(platform, tools, libs, kotlin, keystore):
    src = Path(__file__).resolve().parent
    with TemporaryDirectory() as temp:
        tmp = Path(temp)
        jars = []
        with ZipFile(libs/"rcsdk-v1.9.2.aar") as sdk:
            for n in sdk.namelist():
                if n.startswith(("assets/","res/")) and not n.endswith("/"):
                    sdk.extract(n,tmp)
        for aar in ("rcsdk-v1.9.2","h16_airlink"):
            jar = tmp / (aar+".jar")
            with ZipFile(libs/(aar+".aar")) as z:
                jar.write_bytes(z.read("classes.jar"))
            jars.append(jar)
        jars.append(kotlin)
        for d in ("gen","classes","dex"):
            (tmp/d).mkdir()
        aapt = tools/"aapt2.exe"
        run(aapt,"compile","--dir",tmp/"res","-o",tmp/"res.zip")
        run(aapt,"link","-I",platform,"--manifest",src/"AndroidManifest.xml","--java",tmp/"gen",
            "--custom-package","com.skydroid.rcsdk","-A",tmp/"assets","-o",tmp/"unsigned.apk",tmp/"res.zip")
        run("javac","-encoding","UTF-8","-source","8","-target","8","-classpath",
            os.pathsep.join(map(str,[platform,*jars])),"-d",tmp/"classes",*sorted(src.glob("*.java")),
            *list((tmp/"gen").rglob("*.java")))
        run(tools/"d8.bat","--min-api","26","--lib",platform,"--output",tmp/"dex",
            *list((tmp/"classes").rglob("*.class")),*jars)
        with ZipFile(tmp/"unsigned.apk","a",ZIP_DEFLATED) as out, ZipFile(libs/"rcsdk-v1.9.2.aar") as sdk:
            for d in (tmp/"dex").glob("*.dex"): out.write(d,d.name)
            for n in sdk.namelist():
                if n.startswith("jni/arm64-v8a/") and n.endswith(".so"):
                    out.writestr("lib/"+n[4:],sdk.read(n))
        run(tools/"zipalign.exe","-f","4",tmp/"unsigned.apk",tmp/"aligned.apk")
        if not keystore.exists():
            run("keytool","-genkeypair","-keystore",keystore,"-alias","linkstick","-storepass","android",
                "-keypass","android","-keyalg","RSA","-validity","10000","-dname","CN=G20 Link Local Build")
        output=src.parent/"g20-lan-stick.apk"
        run(tools/"apksigner.bat","sign","--ks",keystore,"--ks-pass","pass:android","--out",output,tmp/"aligned.apk")
        run(tools/"apksigner.bat","verify",output)
if __name__ == "__main__":
    p=argparse.ArgumentParser()
    for arg in ("platform","tools","libs","kotlin","keystore"): p.add_argument(arg,type=Path)
    build(**vars(p.parse_args()))
