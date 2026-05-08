#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use lepton_jpeg::{decode_lepton, encode_lepton, EnabledFeatures, DEFAULT_THREAD_POOL};

#[derive(Serialize, Deserialize, Clone)]
pub struct FileItem {
    pub path: String,
    pub base_path: String,
    pub size: u64,
}

#[derive(Serialize)]
pub struct ProcessResult {
    pub success: bool,
    pub original_size: u64,
    pub processed_size: u64,
    pub output_path: String,
    pub error_msg: Option<String>,
}

fn walk_dir(dir: &Path, base: &Path, result: &mut Vec<FileItem>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, base, result);
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
                    if ext == "jpg" || ext == "jpeg" || ext == "lep" {
                        result.push(FileItem {
                            path: path.to_string_lossy().to_string(),
                            base_path: base.to_string_lossy().to_string(),
                            size: path.metadata().map(|m| m.len()).unwrap_or(0), 
                        });
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn scan_paths(paths: Vec<String>) -> Vec<FileItem> {
    let mut result = Vec::new();
    for p_str in paths {
        let path = Path::new(&p_str);
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
                if ext == "jpg" || ext == "jpeg" || ext == "lep" {
                    let base = path.parent().unwrap_or(path).to_string_lossy().to_string();
                    result.push(FileItem {
                        path: p_str.clone(),
                        base_path: base,
                        size: path.metadata().map(|m| m.len()).unwrap_or(0),
                    });
                }
            }
        } else if path.is_dir() {
            walk_dir(path, path, &mut result);
        }
    }
    result
}

fn compute_output_path(
    input_path: &Path,
    base_path: &Path,
    output_dir: &Option<String>,
    keep_structure: bool,
) -> PathBuf {
    let ext = input_path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    let is_encode = ext == "jpg" || ext == "jpeg";
    
    let out_name = if is_encode {
        input_path.with_extension("lep").file_name().unwrap().to_owned()
    } else {
        input_path.with_extension("jpg").file_name().unwrap().to_owned()
    };

    if let Some(out_root_str) = output_dir {
        let out_root = Path::new(out_root_str);
        if keep_structure {
            if let Ok(rel_path) = input_path.strip_prefix(base_path) {
                if let Some(parent) = rel_path.parent() {
                    return out_root.join(parent).join(out_name);
                }
            }
        }
        out_root.join(out_name)
    } else {
        input_path.parent().unwrap().join(out_name)
    }
}

#[tauri::command]
fn check_file_conflict(files: Vec<FileItem>, output_dir: Option<String>, keep_structure: bool) -> Vec<String> {
    let mut conflicts = Vec::new();
    for file in files {
        let input = Path::new(&file.path);
        let base = Path::new(&file.base_path);
        let output_path = compute_output_path(input, base, &output_dir, keep_structure);
        
        if output_path.exists() {
            conflicts.push(output_path.to_string_lossy().to_string());
        }
    }
    conflicts
}

#[tauri::command]
fn run_lepton_task(
    input_path: String,
    base_path: String,
    output_dir: Option<String>,
    keep_structure: bool,
    _no_progressive: bool,
    _accept_dqtswithzeros: bool,
) -> Result<ProcessResult, String> {
    let input = Path::new(&input_path);
    let base = Path::new(&base_path);
    let original_size = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    
    let is_encode = input.extension().unwrap_or_default().to_string_lossy().to_lowercase() != "lep";
    
    let output_path = compute_output_path(input, base, &output_dir, keep_structure);

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    #[cfg(feature = "avx")]
    let mut features = if is_encode { EnabledFeatures::compat_lepton_vector_write() } else { EnabledFeatures::compat_lepton_vector_read() };
    #[cfg(not(feature = "avx"))]
    let mut features = EnabledFeatures::compat_lepton_scalar_read();

    features.max_jpeg_width = 1_000_000;
    features.max_jpeg_height = 1_000_000;

    let input_file = File::open(&input).map_err(|e| format!("打开文件失败: {}", e))?;
    let output_file = File::create(&output_path).map_err(|e| format!("创建输出文件失败: {}", e))?;
    
    let mut reader = BufReader::new(input_file);
    let mut writer = BufWriter::new(output_file);

    let handle = std::thread::Builder::new()
        .name("lepton_heavy_worker".to_string())
        .stack_size(16 * 1024 * 1024)
        .spawn(move || {
            if is_encode {
                encode_lepton(&mut reader, &mut writer, &features, &DEFAULT_THREAD_POOL)
            } else {
                decode_lepton(&mut reader, &mut writer, &features, &DEFAULT_THREAD_POOL)
            }
        })
        .map_err(|e| format!("创建处理线程失败: {}", e))?;

    let process_result = handle.join().map_err(|_| "处理发生崩溃！".to_string())?;


    if let Err(e) = process_result {
        let _ = std::fs::remove_file(&output_path);
        return Err(format!("处理出错: {:?}", e));
    }

    let processed_size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

    Ok(ProcessResult {
        success: true,
        original_size,
        processed_size,
        output_path: output_path.to_string_lossy().to_string(),
        error_msg: None,
    })
}

#[tauri::command]
fn reveal_in_explorer(path: String) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .creation_flags(0x08000000)
            .spawn()
            .ok();
    }
}

#[tauri::command]
fn delete_source_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_paths,
            check_file_conflict,
            run_lepton_task,
            reveal_in_explorer,
            delete_source_file
        ])
        .plugin(tauri_plugin_prevent_default::init()) 
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}